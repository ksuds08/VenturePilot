import { useState } from 'react';

const stages = ['Discover','Validate','Design','Build','Monetize','Launch','Operate','Improve','Maintain'];

export default function App(){
  const [current,setCurrent]=useState(0);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">VenturePilot Guided Journey</h1>
      <ul className="mb-6">
        {stages.map((s,i)=>(
          <li key={s} className="flex items-center mb-1">
            <span className={`w-3 h-3 mr-2 rounded-full ${i<=current?'bg-green-500':'bg-gray-300'}`}/>
            {i===current?<strong>{s}</strong>:s}
          </li>
        ))}
      </ul>
      <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={()=>setCurrent(c=>Math.min(c+1,stages.length-1))}>
        Next
      </button>
    </div>
  );
}
