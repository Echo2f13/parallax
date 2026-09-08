import * as contradictionRepo from '../../db/repositories/contradiction.repo.js'
import * as evidenceRepo from '../../db/repositories/evidence.repo.js'
import type { Contradiction, Evidence } from '../../db/schema.js'

export class ContradictionDetector {
  async checkForContradictions(sessionId: string, newEvidence: Evidence): Promise<Contradiction[]> {
    const existingEvidence = await evidenceRepo.findEvidenceBySessionId(sessionId)
    const contradictions: Contradiction[] = []
    for (const priorEvidence of existingEvidence) {
      if (priorEvidence.id === newEvidence.id || !priorEvidence.location || !newEvidence.location) continue
      if (priorEvidence.location !== newEvidence.location || priorEvidence.description === newEvidence.description) continue
      contradictions.push(await contradictionRepo.insertContradiction({
        sessionId,
        evidenceIdA: priorEvidence.id,
        evidenceIdB: newEvidence.id,
        description: `Conflicting descriptions at ${newEvidence.location}: "${priorEvidence.description}" versus "${newEvidence.description}"`,
      }))
    }
    return contradictions
  }
}