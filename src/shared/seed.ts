import { addDays, type Ymd } from './dates';
import { initialDueDate } from './recurrence';
import type {
  FixtureId,
  Priority,
  Recurrence,
  Risk,
  TaskGuide,
  Visibility,
  ZoneId,
} from './types';

/**
 * Expert maintenance plan for the house profile in the PRD:
 *   Level −1  garage, mechanical room (central heat pump, hot water tank, laundry)
 *   Level 0   entry, living room, kitchen (dishwasher)
 *   Level +1  three bedrooms, bathroom (shower + bathtub)
 *   Outside   backyard lawn, heat pump outdoor unit; roof and gutters
 *
 * "essential" items come straight from the PRD; "recommended" are the additions a home inspector
 * would flag for this profile; "new-home" are one-time first-month tasks for a just-bought house.
 * First due dates are staggered so a new household is not greeted by thirty overdue items, while
 * unknown-history fire and water risks come up first.
 */

export type SeedGroup = 'essential' | 'recommended' | 'new-home';

export interface SeedTask {
  key: string;
  group: SeedGroup;
  title: string;
  zoneId: ZoneId;
  fixtureId: FixtureId | null;
  priority: Priority;
  risks: Risk[];
  recurrence: Recurrence | null;
  /** Days after setup the first occurrence is due (omitted: derived from the recurrence). */
  firstDueInDays?: number;
  estimateMinutes: number;
  quickWin?: boolean;
  guide: TaskGuide;
}

export const SEED_GROUPS: Record<SeedGroup, { title: string; description: string }> = {
  essential: {
    title: 'Essentials for your house',
    description: 'Heat pump, dryer, dishwasher, hot water tank, garage, lawn, gutters and alarms.',
  },
  recommended: {
    title: 'Inspector-recommended',
    description: 'Extra fire, water-damage and air-quality checks that fit this house.',
  },
  'new-home': {
    title: 'New-home checklist',
    description: 'One-time tasks for the first month in a newly bought house.',
  },
};

export const SEED_TASKS: readonly SeedTask[] = [
  // ── Essentials (PRD §7.1) ────────────────────────────────────────────────────────────────
  {
    key: 'smoke-co-test',
    group: 'essential',
    title: 'Test smoke & CO alarms',
    zoneId: 'house',
    fixtureId: 'smoke-detectors',
    priority: 'critical',
    risks: ['fire', 'safety'],
    recurrence: { kind: 'interval', every: 1, unit: 'month' },
    firstDueInDays: 2,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: 'Working alarms cut the risk of dying in a home fire by more than half, and carbon monoxide has no smell. Test every alarm monthly.',
      steps: [
        'Press and hold the test button on each alarm until it sounds — one on every level and outside each sleeping area.',
        'Vacuum dust out of the alarm vents.',
        'Check the date on the back: replace smoke alarms after 10 years and CO alarms after 7–10 years.',
        'If an alarm chirps, replace its battery right away.',
      ],
      safety:
        'With an attached garage, a CO alarm near the bedrooms is a must. The basement level needs its own smoke alarm too.',
    },
  },
  {
    key: 'dryer-vent-cleaning',
    group: 'essential',
    title: 'Clean the dryer exhaust vent',
    zoneId: 'mechanical',
    fixtureId: 'dryer-vent',
    priority: 'critical',
    risks: ['fire'],
    recurrence: { kind: 'interval', every: 1, unit: 'year' },
    firstDueInDays: 10,
    estimateMinutes: 60,
    guide: {
      why: 'Lint that slips past the trap builds up inside the exhaust pipe — a leading cause of dryer fires. A newly bought house rarely comes with a cleaning record, so do the first one soon.',
      steps: [
        'Unplug the dryer (gas dryer: also close its gas valve) and pull it away from the wall.',
        'Loosen the clamp and disconnect the duct from the back of the dryer.',
        'Run a vent brush through the duct from the dryer side, then from the outside hood.',
        "Vacuum the dryer's exhaust port and the lint-trap slot.",
        'Outside, check the vent flap opens freely and closes when the dryer is off.',
        'Reconnect with short rigid or semi-rigid metal duct, then run the dryer for 5 minutes and feel for strong airflow outside.',
      ],
      supplies: ['Dryer vent brush kit', 'Vacuum with hose attachment', 'Foil tape or a duct clamp'],
      safety:
        'Replace any white vinyl or foil accordion duct — it sags, traps lint and can burn. For long ducts or runs through walls, book a professional vent cleaning.',
    },
  },
  {
    key: 'dryer-lint-trap',
    group: 'essential',
    title: 'Clean the dryer lint trap',
    zoneId: 'mechanical',
    fixtureId: 'dryer',
    priority: 'normal',
    risks: ['fire'],
    recurrence: { kind: 'interval', every: 1, unit: 'week' },
    firstDueInDays: 1,
    estimateMinutes: 2,
    quickWin: true,
    guide: {
      why: 'A clean screen keeps air moving, dries clothes faster and keeps lint out of the vent. Ideally every load — this is the weekly nudge to make it a habit.',
      steps: [
        'Pull out the lint screen and roll the lint off by hand.',
        'Once a month, wash the screen with warm soapy water and a soft brush to remove dryer-sheet film; let it dry fully.',
        'Vacuum the slot the screen slides into.',
      ],
    },
  },
  {
    key: 'dishwasher-filter',
    group: 'essential',
    title: 'Clean the dishwasher filter',
    zoneId: 'kitchen',
    fixtureId: 'dishwasher',
    priority: 'normal',
    risks: [],
    recurrence: { kind: 'interval', every: 1, unit: 'month' },
    firstDueInDays: 7,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: 'Most modern dishwashers have a manual filter. When it clogs, dishes come out gritty and the machine starts to smell or drain slowly.',
      steps: [
        'Pull out the bottom rack.',
        'Twist the cylindrical filter a quarter-turn counter-clockwise and lift it out with the flat mesh filter.',
        'Rinse under warm water and scrub with a soft brush and a drop of dish soap.',
        'Reinstall and twist until it locks — a loose filter lets debris reach the pump.',
      ],
    },
  },
  {
    key: 'dishwasher-deep-clean',
    group: 'essential',
    title: 'Deep clean the dishwasher',
    zoneId: 'kitchen',
    fixtureId: 'dishwasher',
    priority: 'low',
    risks: ['water'],
    recurrence: { kind: 'interval', every: 2, unit: 'month' },
    firstDueInDays: 21,
    estimateMinutes: 30,
    guide: {
      why: 'Every 1–3 months depending on use. Clearing the spray arms, door gasket and drain keeps it cleaning well and heads off leaks and odors. Starts at every 2 months — adjust it to your usage.',
      steps: [
        'Clean the filter (see the monthly task).',
        'Pop off the spray arms, clear their holes with a toothpick and rinse.',
        'Wipe the door gasket and the bottom edge of the door, where grime collects.',
        'Check the drain area for debris like glass, labels or fruit pits.',
        'Run an empty hot cycle with dishwasher cleaner, or a cup of white vinegar on the top rack.',
      ],
      supplies: ['Dishwasher cleaner or white vinegar', 'Toothpick', 'Soft brush'],
    },
  },
  {
    key: 'heat-pump-filter-check',
    group: 'essential',
    title: 'Check the heat pump filter',
    zoneId: 'mechanical',
    fixtureId: 'heat-pump',
    priority: 'high',
    risks: ['air', 'efficiency'],
    recurrence: { kind: 'interval', every: 1, unit: 'month' },
    firstDueInDays: 5,
    estimateMinutes: 5,
    quickWin: true,
    guide: {
      why: 'A dirty filter chokes airflow: the system works harder, efficiency drops and the coil can freeze in cooling season. Check monthly while the system is heating or cooling.',
      steps: [
        'Switch the thermostat to off.',
        'Slide the filter out of the indoor unit (or from behind the return-air grille).',
        "Hold it up to a light — if you can't see light through it, clean or replace it.",
        'Washable filter: vacuum, rinse and let it dry completely before putting it back.',
        'Reinstall with the airflow arrow pointing toward the unit.',
      ],
    },
  },
  {
    key: 'heat-pump-filter-replace',
    group: 'essential',
    title: 'Replace the heat pump filter',
    zoneId: 'mechanical',
    fixtureId: 'heat-pump',
    priority: 'high',
    risks: ['air', 'efficiency'],
    recurrence: { kind: 'interval', every: 3, unit: 'month' },
    firstDueInDays: 30,
    estimateMinutes: 10,
    guide: {
      why: 'Disposable filters lose effectiveness even when they look fine. Replace every 1–3 months — sooner with pets, allergies or renovation dust. Starts at every 3 months; the monthly check tells you if it should be sooner.',
      steps: [
        'Note the size printed on the filter frame (e.g. 16×25×1) and keep two spares.',
        'Switch the system off at the thermostat.',
        'Slide in the new filter with the arrow pointing toward the blower.',
        'Write the date on the frame.',
      ],
      supplies: ['Replacement filter — MERV 8–11 balances filtration and airflow'],
    },
  },
  {
    key: 'heat-pump-outdoor-clearance',
    group: 'essential',
    title: 'Clear around the outdoor heat pump unit',
    zoneId: 'backyard',
    fixtureId: 'heat-pump-outdoor',
    priority: 'normal',
    risks: ['efficiency'],
    recurrence: { kind: 'interval', every: 1, unit: 'month' },
    firstDueInDays: 6,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: 'The outdoor unit needs free airflow. Leaves, grass clippings, snow and ice cut efficiency and can damage the fan or coil.',
      steps: [
        'Keep about 2 ft (60 cm) clear on every side and 5 ft (1.5 m) above.',
        'Remove leaves, clippings and debris from the top grille and coil fins.',
        'In winter, clear snow drifts so the unit sits above the snow line. Never chip ice off the coil — the defrost cycle handles it.',
        'Straighten bent fins gently with a fin comb.',
        'Aim the mower discharge away from the unit.',
      ],
      safety: 'Switch off the outdoor disconnect before reaching inside the unit.',
    },
  },
  {
    key: 'heat-pump-tune-up',
    group: 'essential',
    title: 'Book the heat pump tune-up',
    zoneId: 'mechanical',
    fixtureId: 'heat-pump',
    priority: 'high',
    risks: ['efficiency'],
    recurrence: { kind: 'months', months: [4, 10] },
    firstDueInDays: 14,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: 'Twice a year — before cooling season in spring and heating season in fall — a technician checks refrigerant charge, wiring, the condensate drain and the defrost cycle. It protects the warranty and catches problems before the coldest week of the year.',
      steps: [
        'Call an HVAC contractor and book a maintenance visit (about 1–2 hours on site).',
        'Ask them to check refrigerant pressures, electrical connections, the condensate drain, the blower and defrost operation.',
        'Mention any noises, short-cycling or rooms that never feel right.',
        'Keep the service report and add a note here when you mark it done.',
      ],
      pro: true,
    },
  },
  {
    key: 'water-heater-flush',
    group: 'essential',
    title: 'Flush the hot water tank',
    zoneId: 'mechanical',
    fixtureId: 'water-heater',
    priority: 'normal',
    risks: ['water', 'safety'],
    recurrence: { kind: 'interval', every: 1, unit: 'year' },
    firstDueInDays: 30,
    estimateMinutes: 60,
    guide: {
      why: 'Sediment settles at the bottom of the tank, making it noisy and less efficient and shortening its life. A yearly flush — plus a relief-valve test — keeps it safe.',
      steps: [
        'Turn the power off at the breaker (electric) or set the gas valve to “pilot” (gas).',
        'Close the cold-water supply valve on top of the tank.',
        'Attach a garden hose to the drain valve and run it to a floor drain or outside.',
        'Open a hot tap upstairs to let air in, then open the drain valve.',
        'Drain until the water runs clear; briefly open the cold supply to stir up leftover sediment.',
        'Close the drain and refill with the hot tap open until water flows steadily, then restore power or gas.',
        'Test the temperature-pressure relief valve: lift its lever briefly — water should flow, then stop when released.',
      ],
      supplies: ['Garden hose', 'Bucket', 'Work gloves'],
      safety:
        'The water is scalding — let it cool for a few hours first and wear gloves. Never restore power before the tank is full.',
    },
  },
  {
    key: 'garage-inspection',
    group: 'essential',
    title: 'Inspect the garage door & seals',
    zoneId: 'garage',
    fixtureId: 'garage-door',
    priority: 'normal',
    risks: ['safety'],
    recurrence: { kind: 'interval', every: 1, unit: 'year' },
    firstDueInDays: 45,
    estimateMinutes: 30,
    guide: {
      why: 'A yearly look at the door mechanism, auto-reverse and weather seals prevents injuries and keeps drafts, water and pests out of the lower level.',
      steps: [
        'Test auto-reverse: lay a 2×4 flat under the door and close it — it must reverse on contact.',
        'Wave a broom through the photo-eye beam while it closes — the door should reverse.',
        'Lubricate rollers, hinges and springs with garage-door lubricant (not grease).',
        'Check the bottom seal and side weatherstripping for gaps or cracks; replace if brittle.',
        "Look over cables and springs without touching — call a pro if they're frayed or stretched.",
      ],
      safety:
        'Torsion springs are under extreme tension. Leave spring and cable repairs to a garage-door technician.',
    },
  },
  {
    key: 'lawn-mowing',
    group: 'essential',
    title: 'Mow the lawn',
    zoneId: 'backyard',
    fixtureId: 'lawn',
    priority: 'low',
    risks: [],
    recurrence: { kind: 'interval', every: 1, unit: 'week', activeMonths: [5, 6, 7, 8, 9, 10] },
    firstDueInDays: 3,
    estimateMinutes: 45,
    guide: {
      why: 'Weekly in peak growth, every other week when it slows — change the frequency anytime. Mowing high (about 3 in / 7–8 cm) shades out weeds and helps grass survive dry spells.',
      steps: [
        'Never cut more than a third of the blade height at once.',
        'Leave the clippings: they feed the soil.',
        'Alternate the mowing direction to avoid ruts.',
        'Keep the blade sharp — ragged cuts brown the tips.',
        'Blow clippings away from the heat pump unit.',
      ],
    },
  },
  {
    key: 'gutters-exterior-check',
    group: 'essential',
    title: 'Seasonal gutter & exterior check',
    zoneId: 'roof',
    fixtureId: 'gutters',
    priority: 'high',
    risks: ['water'],
    recurrence: { kind: 'months', months: [4, 6, 9, 11] },
    estimateMinutes: 60,
    guide: {
      why: 'Clogged gutters overflow against the foundation — the most common cause of basement leaks. A quick check each season catches problems while they are cheap to fix.',
      steps: [
        'Spring: look for shingles lifted over winter, clear the gutters and make sure downspouts discharge at least 6 ft (2 m) from the foundation.',
        'Summer: walk around the house — siding, caulking around windows, soil sloping away from the walls.',
        'Early fall: trim branches touching the roof; scan the flashing and roof vents from the ground.',
        'Late fall: clear the gutters again after the leaves drop and flush them with a hose to confirm the downspouts flow.',
      ],
      safety:
        'Use a stable ladder with someone footing it — or hire a gutter service for second-storey gutters.',
    },
  },

  // ── Inspector-recommended extras ─────────────────────────────────────────────────────────
  {
    key: 'winterize-hose-bibs',
    group: 'recommended',
    title: 'Winterize the outdoor faucets',
    zoneId: 'backyard',
    fixtureId: 'hose-bib',
    priority: 'high',
    risks: ['water'],
    recurrence: { kind: 'months', months: [10] },
    firstDueInDays: 7,
    estimateMinutes: 15,
    quickWin: true,
    guide: {
      why: 'Water left in an outdoor faucet line can freeze, split the pipe inside the wall and flood the basement when it thaws. Do it before the first hard frost.',
      steps: [
        'Disconnect and drain garden hoses.',
        'Close the indoor shut-off valve feeding each outdoor faucet.',
        'Open the outdoor faucet to drain the line and leave it open for the winter.',
        'If the indoor valve has a small bleeder cap, open it over a bucket to drain the last water.',
        'In spring: close the outdoor faucet, then reopen the indoor valve.',
      ],
    },
  },
  {
    key: 'range-hood-filter',
    group: 'recommended',
    title: 'Degrease the range hood filter',
    zoneId: 'kitchen',
    fixtureId: 'range-hood',
    priority: 'high',
    risks: ['fire'],
    recurrence: { kind: 'interval', every: 3, unit: 'month' },
    firstDueInDays: 14,
    estimateMinutes: 20,
    guide: {
      why: 'Grease trapped in the hood filter is fuel sitting right above the stove. Clean it every 3 months — monthly if you fry often.',
      steps: [
        'Pop the metal mesh filters out of the hood.',
        'Soak them in very hot water with dish soap and a spoonful of baking soda for 15 minutes.',
        'Scrub gently with a soft brush, rinse and let dry — or run them through the dishwasher.',
        'Charcoal (recirculating) filters cannot be washed: replace them every 3–6 months.',
      ],
    },
  },
  {
    key: 'fire-extinguisher-check',
    group: 'recommended',
    title: 'Check the kitchen fire extinguisher',
    zoneId: 'kitchen',
    fixtureId: 'fire-extinguisher',
    priority: 'high',
    risks: ['fire'],
    recurrence: { kind: 'interval', every: 6, unit: 'month' },
    firstDueInDays: 7,
    estimateMinutes: 5,
    quickWin: true,
    guide: {
      why: "Every home should have an ABC extinguisher near the kitchen exit. If there isn't one yet, this is the reminder to buy one.",
      steps: [
        'Mount it near the kitchen exit — never behind or above the stove.',
        'Check that the pressure gauge needle sits in the green.',
        'Make sure the pin and tamper seal are intact and the nozzle is clear.',
        'Turn a dry-chemical unit upside down and shake it to loosen the powder.',
        'Replace disposable units after 10–12 years, or after any use.',
      ],
    },
  },
  {
    key: 'smoke-co-batteries',
    group: 'recommended',
    title: 'Replace smoke & CO alarm batteries',
    zoneId: 'house',
    fixtureId: 'smoke-detectors',
    priority: 'high',
    risks: ['fire', 'safety'],
    recurrence: { kind: 'months', months: [11] },
    estimateMinutes: 20,
    guide: {
      why: 'Once a year when the clocks change in the fall — unless your alarms have sealed 10-year batteries.',
      steps: [
        'Replace the battery in every battery-powered alarm and the backup battery in hard-wired ones.',
        'Press test after each swap.',
        'Flag any smoke alarm older than 10 years or CO alarm older than 7–10 years for replacement.',
      ],
    },
  },
  {
    key: 'gfci-test',
    group: 'recommended',
    title: 'Test GFCI outlets',
    zoneId: 'house',
    fixtureId: null,
    priority: 'normal',
    risks: ['safety'],
    recurrence: { kind: 'interval', every: 3, unit: 'month' },
    firstDueInDays: 20,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: 'Ground-fault outlets in the kitchen, bathroom, garage and outside cut power in a fraction of a second when current leaks — but they can fail silently.',
      steps: [
        'Plug a lamp or night light into the outlet.',
        'Press TEST — the light should go out.',
        'Press RESET — power should come back.',
        'If TEST does nothing or RESET will not hold, replace the outlet (or call an electrician).',
      ],
    },
  },
  {
    key: 'bath-fan-clean',
    group: 'recommended',
    title: 'Clean the bathroom exhaust fan',
    zoneId: 'bathroom',
    fixtureId: 'bath-fan',
    priority: 'normal',
    risks: ['air', 'water'],
    recurrence: { kind: 'interval', every: 6, unit: 'month' },
    firstDueInDays: 35,
    estimateMinutes: 20,
    guide: {
      why: 'The fan pulls shower moisture out before it becomes mold and peeling paint. A dust-clogged fan moves a fraction of the air it should.',
      steps: [
        'Switch the fan off at the switch or breaker.',
        'Pull the cover down and squeeze its spring clips to release it.',
        'Wash the cover in warm soapy water.',
        'Vacuum the blades and housing with a brush attachment.',
        'Test it: a tissue held against the grille should cling.',
        'Run the fan during showers and for 20 minutes after.',
      ],
    },
  },
  {
    key: 'tub-shower-caulk',
    group: 'recommended',
    title: 'Inspect the tub & shower caulking',
    zoneId: 'bathroom',
    fixtureId: 'bathtub',
    priority: 'normal',
    risks: ['water'],
    recurrence: { kind: 'interval', every: 6, unit: 'month' },
    firstDueInDays: 40,
    estimateMinutes: 15,
    guide: {
      why: 'Cracked or moldy caulk lets water behind the tile and into the ceiling below — expensive, invisible damage.',
      steps: [
        'Check along the tub edge, the shower base and the corners for cracks, gaps or black mold.',
        'Look for missing grout.',
        'Re-caulk where needed with 100% silicone: cut out the old bead, clean with rubbing alcohol, let dry, apply a fresh bead.',
        'Keep the shower dry for 24 hours while it cures.',
      ],
      supplies: ['100% silicone kitchen & bath caulk', 'Utility knife', 'Rubbing alcohol'],
    },
  },
  {
    key: 'washer-hoses',
    group: 'recommended',
    title: 'Check washer hoses & clean the washer',
    zoneId: 'mechanical',
    fixtureId: 'washer',
    priority: 'normal',
    risks: ['water'],
    recurrence: { kind: 'interval', every: 3, unit: 'month' },
    firstDueInDays: 25,
    estimateMinutes: 20,
    guide: {
      why: 'A burst washing-machine hose can release hundreds of litres an hour. Catch bulges and cracks early and keep the drum fresh.',
      steps: [
        'Pull the washer forward and check both supply hoses for bulges, cracks or rust at the fittings.',
        'Replace rubber hoses every 5 years — braided stainless-steel hoses are a worthwhile upgrade.',
        'Wipe the door gasket and clear the drain-pump filter if your model has one.',
        'Run an empty hot cleaning cycle with washer cleaner.',
        'Leave the door ajar between loads so it dries out.',
      ],
    },
  },
  {
    key: 'fridge-coils',
    group: 'recommended',
    title: 'Vacuum the refrigerator coils',
    zoneId: 'kitchen',
    fixtureId: 'fridge',
    priority: 'low',
    risks: ['efficiency'],
    recurrence: { kind: 'interval', every: 1, unit: 'year' },
    firstDueInDays: 60,
    estimateMinutes: 20,
    guide: {
      why: "Dusty condenser coils make the compressor run hot and long, wasting energy and shortening the fridge's life.",
      steps: [
        'Unplug the fridge.',
        'Remove the kick plate at the bottom front, or pull the fridge out to reach rear coils.',
        'Vacuum the coils with a brush attachment or a coil brush.',
        'Empty and wipe the drip pan if you can reach it, then plug the fridge back in.',
      ],
    },
  },
  {
    key: 'radon-test',
    group: 'recommended',
    title: 'Test the house for radon',
    zoneId: 'living',
    fixtureId: null,
    priority: 'normal',
    risks: ['air'],
    recurrence: { kind: 'interval', every: 2, unit: 'year' },
    firstDueInDays: 30,
    estimateMinutes: 15,
    guide: {
      why: 'Radon is an invisible, odorless soil gas and the leading cause of lung cancer in non-smokers. Testing is the only way to know your level — ideally a 3-month test during the heating season.',
      steps: [
        'Order a long-term (90-day) radon test kit.',
        'Place it on the lowest level where someone spends at least 4 hours a day — here, the ground floor — about 50 cm above the floor, away from drafts and exterior walls.',
        'Mail it to the lab at the end of the test period.',
        'Above 200 Bq/m³ (Canadian guideline) or 4 pCi/L (US action level)? Get a quote from a certified mitigation professional.',
      ],
    },
  },
  {
    key: 'weatherstripping',
    group: 'recommended',
    title: 'Check door & window weatherstripping',
    zoneId: 'house',
    fixtureId: 'windows',
    priority: 'low',
    risks: ['efficiency'],
    recurrence: { kind: 'months', months: [10] },
    firstDueInDays: 21,
    estimateMinutes: 30,
    guide: {
      why: 'Drafty doors and windows are among the cheapest energy fixes, and they cause cold spots that confuse the thermostat.',
      steps: [
        'On a windy day, hold a damp hand or an incense stick near door and window edges to find drafts.',
        'Close each door on a sheet of paper — if it slides out easily, the seal is worn.',
        'Replace worn foam or rubber weatherstripping and door sweeps.',
        'Re-caulk gaps around the exterior trim.',
      ],
    },
  },

  // ── New-home checklist (one-time) ────────────────────────────────────────────────────────
  {
    key: 'find-water-main',
    group: 'new-home',
    title: 'Find & label the main water shutoff',
    zoneId: 'mechanical',
    fixtureId: 'water-main',
    priority: 'high',
    risks: ['water'],
    recurrence: null,
    firstDueInDays: 3,
    estimateMinutes: 15,
    quickWin: true,
    guide: {
      why: 'In a leak, every minute counts. Both of you should know exactly where the main shutoff is — and that it actually turns.',
      steps: [
        'Follow the water line where it enters the house, usually in the mechanical room on the street side.',
        'Close it and confirm no water runs at a faucet, then open it again.',
        'Tag it with a bright label and show each other where it is.',
      ],
    },
  },
  {
    key: 'rekey-locks',
    group: 'new-home',
    title: 'Rekey or replace the exterior locks',
    zoneId: 'entry',
    fixtureId: 'front-door',
    priority: 'high',
    risks: ['safety'],
    recurrence: null,
    firstDueInDays: 7,
    estimateMinutes: 10,
    quickWin: true,
    guide: {
      why: "There's no telling how many keys previous owners, contractors or agents still have. Rekeying is inexpensive and a standard first step in a new home.",
      steps: [
        'Call a locksmith to rekey the front door, the garage entry and any side doors.',
        'Change the garage-door opener and keypad codes.',
        'Reset any smart-lock or alarm codes left by the previous owners.',
      ],
      pro: true,
    },
  },
  {
    key: 'label-breakers',
    group: 'new-home',
    title: 'Map & label the electrical panel',
    zoneId: 'mechanical',
    fixtureId: 'electrical-panel',
    priority: 'normal',
    risks: ['safety'],
    recurrence: null,
    firstDueInDays: 14,
    estimateMinutes: 45,
    guide: {
      why: 'Accurate breaker labels make every repair, outage or emergency faster and safer.',
      steps: [
        'With a helper, switch off one breaker at a time and note which lights and outlets go dead.',
        'Write clear labels, e.g. “Kitchen counter outlets — right side”.',
        'Photograph the labelled panel and paste the details into this task’s notes.',
      ],
    },
  },
  {
    key: 'appliance-manuals',
    group: 'new-home',
    title: 'Collect appliance manuals & warranties',
    zoneId: 'house',
    fixtureId: null,
    priority: 'low',
    risks: [],
    recurrence: null,
    firstDueInDays: 30,
    estimateMinutes: 30,
    guide: {
      why: 'Model numbers, warranty dates and manuals turn future repairs into a two-minute lookup.',
      steps: [
        'Photograph the rating plate on the heat pump, hot water tank, dryer, washer, dishwasher and fridge.',
        "Download the manuals from the manufacturers' sites.",
        'Register anything still under warranty.',
        'Add the heat pump filter size and the tank install year to the matching tasks.',
      ],
    },
  },
];

/** Concrete task fields for a seed item, with its first due date resolved against `today`. */
export function resolveSeed(seed: SeedTask, today: Ymd) {
  const dueDate = seed.recurrence
    ? initialDueDate(seed.recurrence, today, seed.firstDueInDays)
    : seed.firstDueInDays !== undefined
      ? addDays(today, seed.firstDueInDays)
      : null;
  return {
    kind: 'maintenance' as const,
    visibility: 'shared' as Visibility,
    title: seed.title,
    notes: '',
    guide: seed.guide,
    zoneId: seed.zoneId,
    fixtureId: seed.fixtureId,
    priority: seed.priority,
    risks: seed.risks,
    quickWin: seed.quickWin ?? false,
    estimateMinutes: seed.estimateMinutes,
    contact: null,
    dueDate,
    recurrence: seed.recurrence,
    seedKey: seed.key,
  };
}

/** One-tap ideas offered on an empty to-do list (the PRD's quick-call examples). */
export const QUICK_WIN_IDEAS: readonly {
  title: string;
  estimateMinutes: number;
  visibility: Visibility;
  zoneId: ZoneId | null;
}[] = [
  { title: 'Book a dentist appointment', estimateMinutes: 5, visibility: 'personal', zoneId: null },
  { title: 'Book the tire change at Costco', estimateMinutes: 10, visibility: 'shared', zoneId: 'garage' },
  { title: 'Book the car service', estimateMinutes: 10, visibility: 'shared', zoneId: 'garage' },
  { title: 'Call the home insurer to update the policy', estimateMinutes: 15, visibility: 'shared', zoneId: null },
];
