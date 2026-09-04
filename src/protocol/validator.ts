import { investigationResultSchema } from './schemas.js'
import type { InvestigationResult } from './messages.js'

export type ValidationSuccess = { valid: true; data: InvestigationResult }
export type ValidationFailure = { valid: false; errors: string[] }
export type ValidationResult = ValidationSuccess | ValidationFailure

export function validateAgentResponse(raw: unknown): ValidationResult {
  const result = investigationResultSchema.safeParse(raw)
  if (result.success) {
    return { valid: true, data: result.data }
  }
  const errors = result.error.errors.map(error => `${error.path.join('.')}: ${error.message}`)
  return { valid: false, errors }
}