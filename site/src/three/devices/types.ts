import type { GeoBuilder, V3 } from '../builder'
import type { ModelId } from '../contract'

/**
 * One moving piece of an exploded device. Geometry is authored in the part's
 * own pivot space; `pos/rot` place the pivot when assembled, `xpos/xrot` when
 * fully exploded. Ids starting with `_` are sub-pieces that are not
 * highlightable on their own (they light up with their parent).
 */
export type PartSpec = {
  id: string
  /** Stagger rank: 0 leaves first (outer parts), higher ranks follow. */
  rank: number
  build: (b: GeoBuilder) => void
  pos?: V3
  rot?: V3
  xpos?: V3
  xrot?: V3
  /**
   * Waypoints between the assembled and exploded pose (parent space), so a part can
   * leave its shell before it heads to its exploded spot. A bare V3 is a position;
   * the rotation is then shared out evenly along the path.
   */
  via?: (V3 | { pos: V3; rot?: V3 })[]
  /** Grows in while exploding (e.g. thermal paste); hidden when assembled. */
  appear?: boolean
  /** Light up with this part instead of on its own (for a `_` piece that is not nested in it). */
  group?: string
  /** Nest inside another part's pivot (pos/rot are then relative to it). */
  parent?: string
}

export type ModelSpec = {
  id: ModelId
  parts: PartSpec[]
  /**
   * Turns the authored model so its "front" (the face the camera should see)
   * points to +z. Applied inside the model, before any placement.
   */
  frontYaw?: number
  /** Camera direction relative to the front: azimuth / elevation in degrees, plus fov. */
  view: { az: number; el: number; fov?: number }
  /**
   * Share of the explode timeline each part spends moving (default 0.5). Lower means
   * the ranks follow each other more strictly: outer parts are clear before inner ones move.
   */
  span?: number
  /** Where the device stage camera starts, degrees around the device from its front (default about 30). */
  stageAz?: number
  /** Placement in the workshop (world). The yaw turns the model's front. */
  place: { pos: V3; yaw: number }
  /** Workshop-only props that never move (trolley, dolly...). Not shown on the device stage. */
  shopBase?: (b: GeoBuilder) => void
  /** Shown assembled as a normal prop at its spot when no other device takes the spot. */
  idle?: boolean
  /** Idle props hidden while this model is on show (it takes their spot). */
  replaces?: ModelId[]
}
