const handleSend = async () => {
  if (!input.trim() || loading) return;
  setLoading(true);

  const newMessage = { role: "user", content: input.trim() };
  setInput("");

  let newIdea = activeIdea;
  if (!newIdea) {
    const id = uuidv4();
    newIdea = {
      id,
      title: input.trim(),
      draft: "",
      messages: [newMessage],
      locked: false,
      editing: false,
      validation: null,
      validationError: null,
      lastValidated: null,
    };
    setIdeas((prev) => [...prev, newIdea]);
    setActiveIdeaId(id);
  } else {
    newIdea.messages.push(newMessage);
    updateIdea(newIdea.id, { messages: [...newIdea.messages] });
  }

  try {
    const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newIdea.messages }),
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error("Response was not valid JSON");
    }

    if (!res.ok) {
      const message = data?.error || `Server error ${res.status}`;
      throw new Error(message);
    }

    const reply = data?.reply || "No reply received.";
    const refined = data?.refinedIdea || "";

    const assistantMsg = { role: "assistant", content: "" };
    const words = reply.split(" ");
    const updatedMsgs = [...newIdea.messages, assistantMsg];
    updateIdea(newIdea.id, { messages: updatedMsgs });

    let streamed = "";
    for (const word of words) {
      streamed += word + " ";
      updateIdea(newIdea.id, {
        messages: updatedMsgs.map((m, i) =>
          i === updatedMsgs.length - 1 ? { ...m, content: streamed.trim() } : m
        ),
      });
      await delay(30);
    }

    updateIdea(newIdea.id, {
      draft: refined,
    });
  } catch (err) {
    console.error("Assistant error:", err);
    alert(
      err instanceof Error
        ? `Assistant failed: ${err.message}`
        : "Something went wrong while submitting your idea."
    );
  }

  setLoading(false);
};

