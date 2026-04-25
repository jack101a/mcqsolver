import { createWorkflowRequestSchema, runWorkflowRequestSchema } from "@autofill/schemas";
import type { z } from "zod";

export type CreateWorkflowInput = z.infer<typeof createWorkflowRequestSchema>;
export type RunWorkflowInput = z.infer<typeof runWorkflowRequestSchema>;

export class WorkflowClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  async createWorkflow(input: CreateWorkflowInput): Promise<Response> {
    return fetch(`${this.baseUrl}/workflows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(input)
    });
  }

  async runWorkflow(input: RunWorkflowInput): Promise<Response> {
    return fetch(`${this.baseUrl}/execution/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(input)
    });
  }
}
