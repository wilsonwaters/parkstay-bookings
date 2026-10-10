/**
 * The fictional Example Holiday Parks website the example browser provider reads
 * (`tests/fixtures/providers/example-browser/index.ts`): `renderExampleSite(url)` answers a page
 * navigation with a status and HTML, using the attributes and words a real site would.
 */

export interface ExampleSitePage {
  status: number;
  html: string;
}

interface Park {
  id: string;
  kind: string;
  name: string;
  town: string;
  lat: number;
  lng: number;
  cabins: { id: string; name: string; nights: Record<string, [status: string, label: string]> }[];
}

const PARKS: Park[] = [
  {
    id: 'sunset-bay',
    kind: 'holiday',
    name: 'Sunset Bay Holiday Park',
    town: 'Busselton',
    lat: -33.6455,
    lng: 115.3459,
    cabins: [
      {
        id: 'c1',
        name: 'Beach Cabin 1',
        nights: {
          '2026-11-09': ['vacant', '$150.00'],
          '2026-11-10': ['vacant', '$145.00'],
          '2026-11-11': ['vacant', '$155.00'],
        },
      },
      {
        id: 'c2',
        name: 'Garden Cabin 2',
        nights: { '2026-11-10': ['booked', 'Booked'], '2026-11-11': ['vacant', '$120.00'] },
      },
    ],
  },
  {
    id: 'river-gums',
    kind: 'caravan',
    name: 'River Gums Caravan Park',
    town: 'Northam',
    lat: -31.6531,
    lng: 116.6675,
    cabins: [],
  },
];

const page = (body: string, status = 200): ExampleSitePage => ({
  status,
  html: `<!doctype html><html><head><title>Example Holiday Parks</title></head><body>${body}</body></html>`,
});

function parkAttributes(park: Park): string {
  return `data-park="${park.id}" data-kind="${park.kind}" data-lat="${park.lat}" data-lng="${park.lng}"`;
}

function parkHeading(park: Park): string {
  return `<h2 data-testid="name">${park.name}</h2><span data-testid="town">${park.town}</span>`;
}

export function renderExampleSite(url: URL): ExampleSitePage {
  if (url.pathname === '/parks') {
    const items = PARKS.map((park) => `<li ${parkAttributes(park)}>${parkHeading(park)}</li>`);
    return page(`<ul class="css-1x2y3z">${items.join('')}</ul>`);
  }
  const match = /^\/parks\/([^/]+)(\/availability)?$/.exec(url.pathname);
  const park = match && PARKS.find((p) => p.id === decodeURIComponent(match[1]));
  if (!park) return page('<h1>Page not found</h1>', 404);

  if (!match[2]) {
    const units = park.cabins.map((cabin) => `<li data-unit="${cabin.id}">${cabin.name}</li>`);
    return page(
      `<main ${parkAttributes(park)}>${parkHeading(park)}<ul>${units.join('')}</ul></main>`
    );
  }

  // The availability grid shows the whole week, whatever the stay.
  const rows = park.cabins.map((cabin) => {
    const cells = Object.entries(cabin.nights).map(
      ([date, [status, label]]) => `<td data-night="${date}" data-status="${status}">${label}</td>`
    );
    return `<tr data-unit="${cabin.id}" data-unit-name="${cabin.name}">${cells.join('')}</tr>`;
  });
  return page(`<table>${rows.join('')}</table>`);
}
