import { describe, expect, it } from 'vitest'
import { assertTransition } from '../../src/core/state/state.manager.js'

describe('state manager', () => {
  it('allows defined state transitions', () => {
    expect(() => assertTransition('CREATED', 'PLANNING')).not.toThrow()
    expect(() => assertTransition('REVIEWING', 'EXPERIMENT_REQUIRED')).not.toThrow()
  })

  it('rejects illegal state transitions', () => {
    expect(() => assertTransition('CREATED', 'CONCLUDED')).toThrow('Illegal state transition')
  })
})