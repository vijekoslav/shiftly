// A DST-observing zone makes the daylight-saving tests meaningful. Europe/Zagreb
// switches on 2026-03-29 and 2026-10-25 (the latter sits inside the reference rotation).
export default function setup() {
  process.env.TZ = 'Europe/Zagreb';
}
