# Chaoscoin Heartbeat Checklist

Run this checklist every cycle. Be efficient — do everything in one pass.

## Every Cycle

1. **Send heartbeat**: `python3 ~/chaos.py heartbeat`
2. **Check report**: `python3 ~/chaos.py report`
3. **Act on recommendations** from the report JSON:
   - If `can_spend` is true and there are recommendations → execute the first one
   - After buying a rig → immediately equip it
   - After any purchase → run `report` again to confirm
4. **Report to user** ONLY if something happened:
   - You bought/equipped something
   - Balance milestone hit (1k, 5k, 10k, 50k)
   - Transaction failed
   - MON gas low (< 0.05)
   - Strategic suggestion
5. If nothing interesting → respond `HEARTBEAT_OK` (silent)

## Decision Thresholds

- **Under 5,000 CHAOS**: Just do it and report
- **5,000–10,000 CHAOS**: Do it and explain why
- **Over 10,000 CHAOS**: Ask user first
- **Zone migration**: ALWAYS ask user first
