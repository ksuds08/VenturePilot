// SPDX-License-Identifier: MIT
//
// Generic CRUD endpoint template.  This stub demonstrates how a typical
// Cloudflare Pages Function might handle Create, Read, Update and Delete
// operations over a resource.  Code generators can clone this file and
// customise the storage mechanism and data model as needed.

export async function crudHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  switch (req.method) {
    case 'GET': {
      // TODO: fetch and return a record by ID
      return new Response(JSON.stringify({ message: 'Read stub', id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    case 'POST': {
      // TODO: create a new record from the request body
      return new Response(JSON.stringify({ message: 'Create stub' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    case 'PUT':
    case 'PATCH': {
      // TODO: update an existing record
      return new Response(JSON.stringify({ message: 'Update stub', id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    case 'DELETE': {
      // TODO: delete a record
      return new Response(JSON.stringify({ message: 'Delete stub', id }), { status: 204, headers: { 'Content-Type': 'application/json' } });
    }
    default:
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
}
