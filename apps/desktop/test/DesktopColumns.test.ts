import { describe, expect, it } from 'vitest'
import { computeColumns, CENTER_MIN, DETAILS_MIN } from '../../../plugins/desktop-chrome/src/client/columns.ts'

describe('desktop right sidebar room', () => {
  it.each([1024, 1100, 1200, 1600])('keeps the right sidebar reachable at %ipx', width => {
    const columns = computeColumns(width, 280, 360)
    expect(columns.details).toBeGreaterThanOrEqual(DETAILS_MIN)
    expect(columns.center).toBeGreaterThanOrEqual(CENTER_MIN)
    expect(columns.sidebar + columns.center + columns.details).toBe(width)
  })
  it('supports narrow windows after the left sidebar auto-collapses', () => {
    expect(computeColumns(768, 0, 360).details).toBe(360)
  })
})
