import east0 from './simulation-geometry/east-0.js';
import east1 from './simulation-geometry/east-1.js';
import east2 from './simulation-geometry/east-2.js';
import east3 from './simulation-geometry/east-3.js';
import east4 from './simulation-geometry/east-4.js';
import east5 from './simulation-geometry/east-5.js';
import east6 from './simulation-geometry/east-6.js';
import west0 from './simulation-geometry/west-0.js';
import west1 from './simulation-geometry/west-1.js';
import west2 from './simulation-geometry/west-2.js';
import west3 from './simulation-geometry/west-3.js';
import west4 from './simulation-geometry/west-4.js';
import west5 from './simulation-geometry/west-5.js';
import west6 from './simulation-geometry/west-6.js';

// Mantém inclusive a ordem dos retângulos recuperados do cliente original.
export const BUILDINGS = [
  ...east0,
  ...east1,
  ...east2,
  ...east3,
  ...east4,
  ...east5,
  ...east6,
  ...west0,
  ...west1,
  ...west2,
  ...west3,
  ...west4,
  ...west5,
  ...west6,
]
  .sort((a, b) => a[4] - b[4])
  .map(([x, z, w, d]) => [x, z, w, d]);
