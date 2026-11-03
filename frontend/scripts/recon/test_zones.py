"""Zone detection in build_recon.py: python3 -I scripts/recon/test_zones.py"""
import importlib.util, unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("build_recon", Path(__file__).with_name("build_recon.py"))
br = importlib.util.module_from_spec(spec)
spec.loader.exec_module(br)


def lap(speeds, braking):
    return [{"s": i * 25.0, "t": i * 0.25, "speed": float(v), "gear": 4, "throttle": 0.0, "brake": i in braking}
            for i, v in enumerate(speeds)]


SPEEDS = [300, 300, 300, 260, 200, 140, 120, 150, 210, 280, 300, 300]


class Zones(unittest.TestCase):
    def test_brake_signal(self):
        zones, by = br.braking_zones(lap(SPEEDS, {3, 4, 5}))
        self.assertEqual(by, "brake")
        self.assertEqual([(z["fromSpeed"], z["minSpeed"], z["seconds"]) for z in zones], [(260, 120, 0.5)])

    def test_no_brake_signal_falls_back_to_speed(self):
        zones, by = br.braking_zones(lap(SPEEDS, set()))
        self.assertEqual(by, "speed")
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0]["minSpeed"], 120)
        self.assertIsNone(zones[0]["seconds"])  # the time on the brakes was not measured

    def test_small_drops_are_not_zones(self):
        self.assertEqual(br.braking_zones(lap([300, 295, 290, 296, 300], {1, 2}))[0], [])
        self.assertEqual(br.braking_zones(lap([300, 295, 290, 296, 300], set()))[0], [])


if __name__ == "__main__":
    unittest.main()
