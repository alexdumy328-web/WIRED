import L from 'leaflet'

/** The shop's pin: a dark pad with a lit gold dot, the same on both themes. */
export const shopIcon = () =>
  L.divIcon({
    className: 'nt-shop-icon',
    html: `
        <div style="
          width: 26px;
          height: 26px;
          background: #1a1c1e;
          border: 2px solid #d9a93f;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 10px rgba(0,0,0,0.45);
        ">
          <div style="
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #d9a93f;
            box-shadow: 0 0 6px #d9a93f;
          "></div>
        </div>
      `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })

/** OpenStreetMap tiles, tinted to the site palette by the nt-tiles-* classes in index.css. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
