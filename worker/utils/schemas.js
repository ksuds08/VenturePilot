// SPDX-License-Identifier: MIT
//
// JSON schema definitions for OpenAI function‑calling.  These schemas define
// the structure of the objects returned from the planning, component
// decomposition and file generation steps.  By describing the expected
// structure up front, we can instruct OpenAI to call functions with
// strongly‑typed arguments and validate the output on our side.

export const planSchema = {
  type: 'object',
  properties: {
    mvp: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        features: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              feature: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['feature', 'description'],
          },
          minItems: 1,
        },
        technology: { type: 'string' },
        targetAudience: { type: 'string' },
        businessModel: { type: 'string' },
        launchPlan: { type: 'string' },
        visualStyle: { type: 'string' },
        userFlow: { type: 'string' },
        dataFlow: { type: 'string' },
        keyComponents: {
          type: 'array',
          items: { type: 'string' },
        },
        exampleInteractions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['name', 'description', 'features', 'technology'],
    },
    backendEndpoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          method: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['path', 'method', 'description'],
      },
    },
  },
  required: ['mvp'],
};

export const componentListSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['frontend', 'backend'] },
      description: { type: 'string' },
      location: { type: 'string' },
    },
    required: ['name', 'type', 'description', 'location'],
  },
};

export const fileMapSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
};
