// Shared board geometry must reproduce the previous online spring formulas
// exactly, for every layout variant, side, zone and material layer.
import assert from "node:assert/strict";

import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { boardGeometry, cardPose, zoneRect, materialOffset } =
    await server.ssrLoadModule("/src/ui/Shared/DuelBoard/geometry.ts");
  const { sceneSpot } = await server.ssrLoadModule(
    "/src/ui/Shared/DuelBoard/scene.ts",
  );

  // Previous moveToGround / moveToHand / moveToOutside / moveToDeck maths.
  const legacy = {
    ground(g, { near, zone, sequence, defense, faceDown, overlay }) {
      let height = zone === "spell" ? g.BLOCK_HEIGHT_S : g.BLOCK_HEIGHT_M;
      let x = 0,
        y = 0;
      if (zone === "spell") {
        if (sequence === 5) {
          height = g.CARD_HEIGHT_O;
          x = -(
            g.BLOCK_WIDTH * 2.5 +
            g.COL_GAP * 2 +
            g.BLOCK_OUTSIDE_OFFSET_X +
            g.CARD_HEIGHT_O * g.CARD_RATIO * 0.5
          );
        } else x = (sequence - 2) * (g.BLOCK_WIDTH + g.COL_GAP);
        y = g.SPELL_ROW_Y;
      } else if (sequence > 4) {
        x = (sequence > 5 ? 1 : -1) * (g.BLOCK_WIDTH + g.COL_GAP);
      } else {
        x = (sequence - 2) * (g.BLOCK_WIDTH + g.COL_GAP);
        y = g.MONSTER_ROW_Y;
      }
      if (!near) {
        x = -x;
        y = -y;
      }
      const rz = (near ? 0 : 180) + (!overlay && defense ? 90 : 0);
      let zIndex = 3;
      if (overlay) {
        const o = materialOffset(overlay.index, overlay.count, height);
        x += o.x;
        y += o.y;
        zIndex = 2 - overlay.count + overlay.index;
      }
      return { x, y, height, rz, ry: !overlay && faceDown ? 180 : 0, zIndex };
    },
    hand(g, { near, sequence, handCount }) {
      const cy =
        g.BLOCK_HEIGHT_M +
        g.BLOCK_HEIGHT_S +
        2 * g.ROW_GAP +
        (g.HAND_MARGIN_TOP +
          g.HAND_CARD_HEIGHT +
          g.HAND_CIRCLE_CENTER_OFFSET_Y);
      const w = g.CARD_RATIO * g.HAND_CARD_HEIGHT;
      const theta =
        2 *
        Math.atan(
          w / 2 / (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT),
        ) *
        0.9;
      const angle = (sequence - (handCount - 1) / 2) * theta;
      const r = g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT / 2;
      const x = Math.sin(angle) * r * (near ? 1 : -1);
      const y =
        cy -
        (Math.cos(angle) * r + g.HAND_CARD_HEIGHT / 2) +
        g.HAND_MAT_OFFSET_Y;
      const rz = (angle * 180) / Math.PI;
      return {
        x: near ? x : -x,
        y: near ? y : -y,
        z: sequence + 5,
        rz: near ? rz : 180 - rz,
        ry: near ? 0 : 180,
        height: g.HAND_CARD_HEIGHT,
        zIndex: sequence,
      };
    },
    outside(g, { near, zone, sequence, faceDown }) {
      let x =
          g.BLOCK_WIDTH * 2.5 +
          g.COL_GAP * 2 +
          g.BLOCK_OUTSIDE_OFFSET_X +
          g.CARD_HEIGHT_O * g.CARD_RATIO * 0.5,
        y = g.SPELL_ROW_Y;
      if (zone === "removed") y -= g.ROW_GAP + g.CARD_HEIGHT_O;
      if (!near) {
        x = -x;
        y = -y;
      }
      return {
        x,
        y,
        z: 0,
        height: g.CARD_HEIGHT_O,
        rz: near ? 0 : 180,
        ry: faceDown ? 180 : 0,
        zIndex: sequence,
      };
    },
    deck(g, { near, zone, sequence, faceDown }) {
      const right = g.DECK_OFFSET_X + 2 * (g.BLOCK_WIDTH + g.COL_GAP);
      let x = near ? right : -right;
      const y = near ? g.DECK_ROW_Y : -g.DECK_ROW_Y;
      if (zone === "extra") x = near ? -right : right;
      const rz =
        (zone === "extra" ? g.DECK_ROTATE_Z : -g.DECK_ROTATE_Z) +
        (near ? 0 : 180);
      return {
        x,
        y,
        z: sequence,
        rz,
        ry: faceDown ? 180 : 0,
        zIndex: sequence,
        height: g.DECK_CARD_HEIGHT,
      };
    },
  };
  const close = (actual, expected, label) => {
    for (const key of Object.keys(expected))
      assert.ok(
        Math.abs(actual[key] - expected[key]) < 1e-9,
        `${label}: ${key} ${actual[key]} != ${expected[key]}`,
      );
  };
  let checked = 0;
  for (const wide of [false, true])
    for (const roomy of [false, true])
      for (const masterRule of [2, 4]) {
        const g = boardGeometry({ wide, masterRule, roomy });
        for (const near of [true, false]) {
          for (const zone of ["monster", "spell"])
            for (
              let sequence = 0;
              sequence < (zone === "monster" ? 7 : 6);
              sequence++
            )
              for (const defense of [false, true])
                for (const faceDown of [false, true]) {
                  const spot = { zone, near, sequence };
                  const label = JSON.stringify({
                    wide,
                    roomy,
                    masterRule,
                    ...spot,
                    defense,
                    faceDown,
                  });
                  close(
                    cardPose(g, { spot, defense, faceDown }),
                    legacy.ground(g, { ...spot, defense, faceDown }),
                    label,
                  );
                  for (const count of [1, 3])
                    for (let index = 0; index < count; index++) {
                      const overlay = { index, count };
                      close(
                        cardPose(g, { spot, overlay }),
                        legacy.ground(g, { ...spot, overlay }),
                        `${label} overlay ${index}/${count}`,
                      );
                    }
                  checked++;
                }
          for (const handCount of [1, 5, 9])
            for (let sequence = 0; sequence < handCount; sequence++) {
              const spot = { zone: "hand", near, sequence };
              close(
                cardPose(g, { spot, handCount }),
                legacy.hand(g, { ...spot, handCount }),
                `hand ${near} ${sequence}/${handCount}`,
              );
              checked++;
            }
          for (const zone of ["grave", "removed"])
            for (const faceDown of [false, true]) {
              const spot = { zone, near, sequence: 3 };
              close(
                cardPose(g, { spot, faceDown }),
                legacy.outside(g, { ...spot, faceDown }),
                `${zone} ${near}`,
              );
              checked++;
            }
          for (const zone of ["deck", "extra"])
            for (const faceDown of [false, true]) {
              const spot = { zone, near, sequence: 7 };
              close(
                cardPose(g, { spot, faceDown }),
                legacy.deck(g, { ...spot, faceDown }),
                `${zone} ${near}`,
              );
              checked++;
            }
        }
        // Zone outlines sit exactly under resting cards and mirror between sides.
        for (const zone of [
          "monster",
          "spell",
          "grave",
          "removed",
          "deck",
          "extra",
        ]) {
          const near = zoneRect(g, { zone, near: true, sequence: 1 });
          const far = zoneRect(g, { zone, near: false, sequence: 1 });
          assert.deepEqual(
            [far.x, far.y, far.rotation],
            [-near.x, -near.y, near.rotation + 180],
          );
          const pose = cardPose(g, { spot: { zone, near: true, sequence: 1 } });
          assert.deepEqual(
            [pose.x, pose.y, pose.height],
            [near.x, near.y, near.height],
          );
        }
      }
  // Offline modes reach the same geometry through Core location bits.
  const g = boardGeometry({ wide: true, masterRule: 2, roomy: true });
  for (const [location, zone] of [
    [1, "deck"],
    [2, "hand"],
    [4, "monster"],
    [8, "spell"],
    [16, "grave"],
    [32, "removed"],
    [64, "extra"],
  ])
    for (const view of [0, 1])
      assert.deepEqual(sceneSpot({ player: 0, location, sequence: 2 }, view), {
        zone,
        near: view === 0,
        sequence: 2,
      });
  assert.deepEqual(
    sceneSpot({ player: 1, location: 4 | 128, sequence: 0 }, 1).zone,
    "monster",
  );
  // Roomy screens widen only the row gap and grow the board to fit it.
  const tight = boardGeometry({ wide: true, masterRule: 2, roomy: false });
  assert.equal(g.ROW_GAP - tight.ROW_GAP, 18);
  assert.equal(g.BOARD_HEIGHT - tight.BOARD_HEIGHT, 54);
  console.log(JSON.stringify({ passed: true, poseCases: checked }));
} finally {
  await server.close();
}
