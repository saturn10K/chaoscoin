"""
Chaoscoin Autonomous Miner for OpenClaw Bot
============================================
A standalone Python script that mines CHAOS tokens on Monad Testnet.
Only dependency: pip3 install eth-account

Agent #32 | Dark Forest (Zone 2)

Commands:
  python3 chaoscoin_miner.py status       # Human-readable status
  python3 chaoscoin_miner.py report       # Machine-readable JSON status + recommendations
  python3 chaoscoin_miner.py heartbeat    # Send one heartbeat (mine)
  python3 chaoscoin_miner.py auto         # AUTONOMOUS MODE — makes all decisions
  python3 chaoscoin_miner.py game-info    # Dump full game knowledge as JSON
  python3 chaoscoin_miner.py buy-rig 1    # Buy rig (0=Potato,1=Scrapheap,2=Windmill,3=Magma,4=Neutrino)
  python3 chaoscoin_miner.py equip-rig 33 # Equip rig by ID
  python3 chaoscoin_miner.py migrate 5    # Migrate to zone (0-7)
  python3 chaoscoin_miner.py buy-shield 1 # Buy shield (1=Magnetic,2=Electromagnetic)
  python3 chaoscoin_miner.py upgrade-facility  # Upgrade facility to next level
  python3 chaoscoin_miner.py loop         # Dumb heartbeat loop (no decisions)
"""

import json
import time
import sys
import os
import urllib.request
import urllib.error

# ── Configuration ────────────────────────────────────────────────────────────
# All secrets loaded from environment variables. Set them in .env or export them.

RPC_URL = os.environ.get("RPC_URL", "https://testnet-rpc.monad.xyz")
CHAIN_ID = int(os.environ.get("CHAIN_ID", "10143"))
AGENT_ID = int(os.environ.get("AGENT_ID", "6"))
PRIVATE_KEY = os.environ.get("PRIVATE_KEY", "")
WALLET = os.environ.get("WALLET_ADDRESS", "")

if not PRIVATE_KEY:
    print("ERROR: PRIVATE_KEY environment variable not set.")
    print("  Export it: export PRIVATE_KEY=your_key_here")
    print("  Or create a .env file in the openclaw-bot directory.")
    sys.exit(1)

# Contract addresses
CHAOS_TOKEN    = os.environ.get("CHAOS_TOKEN_ADDRESS", "0x2161752f6f7f70d82eD21088b1aA1C4B4D54d33D")
MINING_ENGINE  = os.environ.get("MINING_ENGINE_ADDRESS", "0x59635BdBD3c7CfcBC885f384dFeC8E010F03fD35")
RIG_FACTORY    = os.environ.get("RIG_FACTORY_ADDRESS", "0x3a3b6479ae72117E86D424f1E3d81a2Ee8005344")
ZONE_MANAGER   = os.environ.get("ZONE_MANAGER_ADDRESS", "0xF8352E967bceB21a5c850933A3aBAf873DED3abb")
AGENT_REGISTRY = os.environ.get("AGENT_REGISTRY_ADDRESS", "0x64be02D7C0D3D7935A967BbEeB92BaE7a9dAaf09")
FACILITY_MGR   = os.environ.get("FACILITY_MANAGER_ADDRESS", "0x9A3087f5Fe9A3b30F22FD59E493Ea782381f2D74")
SHIELD_MGR     = os.environ.get("SHIELD_MANAGER_ADDRESS", "0x3f41274b8581Ef1919C7D8A2b16AC6AF76F1B671")

HEARTBEAT_INTERVAL = 75  # seconds
REGISTRATION_BLOCK = 11672020  # Block when Agent #6 was registered
FIRST_MINE_DELAY = 10000       # Blocks before rewards can be claimed
CLAIM_ELIGIBLE_BLOCK = REGISTRATION_BLOCK + FIRST_MINE_DELAY  # 11682020

# ── Game Knowledge ───────────────────────────────────────────────────────────

RIGS = [
    {"tier": 0, "name": "Potato Rig",    "cost": 0,     "hashrate": 15,   "power": 10,  "durability": 500},
    {"tier": 1, "name": "Scrapheap",     "cost": 500,   "hashrate": 40,   "power": 25,  "durability": 400},
    {"tier": 2, "name": "Windmill",      "cost": 2000,  "hashrate": 100,  "power": 50,  "durability": 350},
    {"tier": 3, "name": "Magma Rig",     "cost": 10000, "hashrate": 300,  "power": 100, "durability": 300},
    {"tier": 4, "name": "Neutrino Rig",  "cost": 50000, "hashrate": 1000, "power": 200, "durability": 250},
]

ZONES = [
    {"id": 0, "name": "Solar Flats",       "bonus": "+10% hashrate",                  "risk": "low"},
    {"id": 1, "name": "Graviton Fields",   "bonus": "+15% cosmic resilience",         "risk": "low"},
    {"id": 2, "name": "Dark Forest",       "bonus": "balanced, no modifiers",         "risk": "medium"},
    {"id": 3, "name": "Nebula Depths",     "bonus": "+8% mining rewards",             "risk": "medium"},
    {"id": 4, "name": "Kuiper Expanse",    "bonus": "-5% rig degradation",            "risk": "low"},
    {"id": 5, "name": "Trisolarian Reach", "bonus": "+20% hashrate, -10% resilience", "risk": "high"},
    {"id": 6, "name": "Pocket Rim",        "bonus": "+12% shield strength",           "risk": "medium"},
    {"id": 7, "name": "Singer Void",       "bonus": "+25% rewards, high event risk",  "risk": "very high"},
]

FACILITIES = [
    {"level": 1, "name": "The Burrow",         "slots": 2, "power": 50,  "shelter": 10, "upgrade_cost": 0},
    {"level": 2, "name": "Faraday Cage",       "slots": 4, "power": 120, "shelter": 30, "upgrade_cost": 5000},
    {"level": 3, "name": "Reinforced Bunker",  "slots": 6, "power": 250, "shelter": 60, "upgrade_cost": 25000},
]

SHIELDS = [
    {"tier": 0, "name": "None",                  "cost": 0,    "absorption": 0,  "charges": 0},
    {"tier": 1, "name": "Magnetic Shield",        "cost": 1000, "absorption": 30, "charges": 3},
    {"tier": 2, "name": "Electromagnetic Shield", "cost": 5000, "absorption": 60, "charges": 5},
]

# ── Signing helpers ──────────────────────────────────────────────────────────

try:
    from eth_account import Account
    HAS_ETH_ACCOUNT = True
except ImportError:
    HAS_ETH_ACCOUNT = False

try:
    from web3 import Web3
    HAS_WEB3 = True
except ImportError:
    HAS_WEB3 = False


# ── RPC helpers ──────────────────────────────────────────────────────────────

def rpc_call(method: str, params: list) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        return {"error": {"message": str(e)}}


def eth_call(to: str, data: str) -> str:
    result = rpc_call("eth_call", [{"to": to, "data": data}, "latest"])
    return result.get("result", "0x")


def encode_uint256(val: int) -> str:
    return hex(val)[2:].zfill(64)


def decode_uint256(hex_str: str) -> int:
    if not hex_str or hex_str == "0x":
        return 0
    return int(hex_str, 16)


def get_balance() -> float:
    addr_padded = WALLET.lower().replace("0x", "").zfill(64)
    result = eth_call(CHAOS_TOKEN, "0x70a08231" + addr_padded)
    return decode_uint256(result) / 1e18


def get_pending_rewards() -> float:
    result = eth_call(MINING_ENGINE, "0xf9f87c18" + encode_uint256(AGENT_ID))
    return decode_uint256(result) / 1e18


def get_block_number() -> int:
    result = rpc_call("eth_blockNumber", [])
    return int(result.get("result", "0x0"), 16)


def get_nonce() -> int:
    result = rpc_call("eth_getTransactionCount", [WALLET, "pending"])
    return int(result.get("result", "0x0"), 16)


def get_gas_price() -> int:
    result = rpc_call("eth_gasPrice", [])
    return int(result.get("result", "0x0"), 16)


def get_mon_balance() -> float:
    """Get native MON balance for gas."""
    result = rpc_call("eth_getBalance", [WALLET, "latest"])
    return int(result.get("result", "0x0"), 16) / 1e18


def get_effective_hashrate() -> int:
    """Get agent's effective hashrate from MiningEngine."""
    result = eth_call(MINING_ENGINE, "0xa92c7909" + encode_uint256(AGENT_ID))
    return decode_uint256(result)


def get_warmup_status() -> dict:
    """Check if agent is past the FIRST_MINE_DELAY warmup."""
    block = get_block_number()
    remaining = max(0, CLAIM_ELIGIBLE_BLOCK - block)
    est_seconds = remaining * 0.4  # ~2.5 blocks/sec on Monad
    return {
        "current_block": block,
        "eligible_block": CLAIM_ELIGIBLE_BLOCK,
        "blocks_remaining": remaining,
        "est_minutes": round(est_seconds / 60, 1),
        "can_claim": remaining == 0,
    }


def check_tx_receipt(tx_hash: str) -> bool:
    """Check if a TX was actually successful on-chain (not just accepted into mempool)."""
    time.sleep(2)
    result = rpc_call("eth_getTransactionReceipt", [tx_hash])
    receipt = result.get("result")
    if not receipt:
        return True  # Receipt not available yet, assume ok
    status = int(receipt.get("status", "0x1"), 16)
    if status == 0:
        print(f"  ⚠ TX reverted on-chain! (used {int(receipt.get('gasUsed', '0x0'), 16)} gas)")
        return False
    return True


# ── Agent detail reading ─────────────────────────────────────────────────────

def get_agent_on_chain() -> dict:
    """Read full agent data from AgentRegistry.getAgent(uint256).
    Returns raw hex — we decode the key fields."""
    # getAgent(uint256) selector
    import hashlib
    sig = "0x" + hashlib.sha3_256(b"getAgent(uint256)").hexdigest()[:8] if False else ""
    # Actually let's just read individual fields we care about
    agent = {
        "agentId": AGENT_ID,
        "wallet": WALLET,
        "balance": get_balance(),
        "pendingRewards": get_pending_rewards(),
        "monBalance": get_mon_balance(),
        "blockNumber": get_block_number(),
    }
    return agent


# ── Transaction sending ──────────────────────────────────────────────────────

def send_tx(to: str, data: str) -> str:
    nonce = get_nonce()
    gas_price = get_gas_price()
    tx = {
        "nonce": nonce,
        "gasPrice": gas_price,
        "gas": 800_000,
        "to": to,
        "value": 0,
        "data": data,
        "chainId": CHAIN_ID,
    }
    if HAS_WEB3:
        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        signed = w3.eth.account.sign_transaction(tx, "0x" + PRIVATE_KEY)
        raw = signed.raw_transaction.hex()
        if not raw.startswith("0x"):
            raw = "0x" + raw
        result = rpc_call("eth_sendRawTransaction", [raw])
    elif HAS_ETH_ACCOUNT:
        acct = Account.from_key("0x" + PRIVATE_KEY)
        signed = acct.sign_transaction(tx)
        raw = signed.raw_transaction.hex()
        if not raw.startswith("0x"):
            raw = "0x" + raw
        result = rpc_call("eth_sendRawTransaction", [raw])
    else:
        return "ERROR: No signing library (pip3 install eth-account)"

    if "error" in result:
        return f"ERROR: {result['error'].get('message', result['error'])}"
    return result.get("result", "unknown")


# ── Function selectors ───────────────────────────────────────────────────────

def build_heartbeat():
    return "0x6e029ad1" + encode_uint256(AGENT_ID)

def build_buy_rig(tier: int):
    return "0xd48fdd2c" + encode_uint256(AGENT_ID) + encode_uint256(tier)

def build_equip_rig(rig_id: int):
    return "0x48857b22" + encode_uint256(AGENT_ID) + encode_uint256(rig_id)

def build_migrate(zone: int):
    return "0x24c59a4e" + encode_uint256(AGENT_ID) + encode_uint256(zone)

def build_buy_shield(tier: int):
    # purchaseShield(uint256,uint8) — verified via cast sig
    return "0x14140aa1" + encode_uint256(AGENT_ID) + encode_uint256(tier)

def build_upgrade_facility():
    # upgradeFacility(uint256) — verified via cast sig
    return "0xee3d7c58" + encode_uint256(AGENT_ID)

def build_claim_rewards():
    # claimRewards(uint256) — manual claim, moves pending rewards to wallet
    return "0xc6d4fa2a" + encode_uint256(AGENT_ID)


# ── Commands ─────────────────────────────────────────────────────────────────

def cmd_status():
    """Full status report."""
    balance = get_balance()
    pending = get_pending_rewards()
    block = get_block_number()
    mon = get_mon_balance()

    warmup = get_warmup_status()

    print("═══ CHAOSCOIN AGENT #32 STATUS ═══")
    print(f"  CHAOS Balance:   {balance:,.2f}")
    print(f"  Pending Rewards: {pending:,.2f}")
    print(f"  MON (gas):       {mon:,.4f}")
    print(f"  Current Block:   {block:,}")
    print(f"  Zone:            Dark Forest (2)")
    if not warmup["can_claim"]:
        print(f"  ⏳ WARMUP:       {warmup['blocks_remaining']:,} blocks left (~{warmup['est_minutes']} min) — rewards accumulate but can't be claimed yet")
    else:
        print(f"  ✅ WARMUP:       Complete — rewards claimable!")
    print()

    # Decision hints
    total_chaos = balance + pending
    print("  ── Purchase Options ──")
    for rig in RIGS:
        affordable = "✓ CAN BUY" if total_chaos >= rig["cost"] and rig["cost"] > 0 else ""
        print(f"    T{rig['tier']} {rig['name']:16s} {rig['cost']:>6,} CHAOS  {rig['hashrate']:>4} H/s  {affordable}")
    print()
    for shield in SHIELDS[1:]:
        affordable = "✓ CAN BUY" if total_chaos >= shield["cost"] else ""
        print(f"    T{shield['tier']} {shield['name']:24s} {shield['cost']:>6,} CHAOS  {shield['absorption']}% absorb  {affordable}")
    print()
    for fac in FACILITIES[1:]:
        affordable = "✓ CAN BUY" if total_chaos >= fac["upgrade_cost"] else ""
        print(f"    L{fac['level']} {fac['name']:20s} {fac['upgrade_cost']:>6,} CHAOS  {fac['slots']} slots  {affordable}")

    print("══════════════════════════════════")
    return {"balance": balance, "pending": pending, "mon": mon, "block": block}


def cmd_heartbeat():
    print(f"[{time.strftime('%H:%M:%S')}] Heartbeat for Agent #{AGENT_ID}...")
    tx = send_tx(MINING_ENGINE, build_heartbeat())
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
        time.sleep(2)
        bal = get_balance()
        pending = get_pending_rewards()
        print(f"  Balance: {bal:,.2f} CHAOS | Pending: {pending:,.2f} CHAOS")
    return tx


def cmd_buy_rig(tier: int):
    rig = RIGS[tier] if tier < len(RIGS) else {"name": f"Tier {tier}", "cost": "?"}
    print(f"Buying {rig['name']} (costs {rig['cost']} CHAOS)...")
    tx = send_tx(RIG_FACTORY, build_buy_rig(tier))
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
        print(f"  NOTE: Check status to see your new rig ID, then equip it!")
    return tx


def cmd_equip_rig(rig_id: int):
    print(f"Equipping rig #{rig_id}...")
    tx = send_tx(RIG_FACTORY, build_equip_rig(rig_id))
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
    return tx


def cmd_migrate(zone: int):
    zname = ZONES[zone]["name"] if zone < len(ZONES) else f"Zone {zone}"
    print(f"Migrating to {zname} (zone {zone})...")
    tx = send_tx(ZONE_MANAGER, build_migrate(zone))
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
        print(f"  Now in {zname}: {ZONES[zone]['bonus']}")
    return tx


def cmd_buy_shield(tier: int):
    shield = SHIELDS[tier] if tier < len(SHIELDS) else {"name": f"T{tier}", "cost": "?"}
    print(f"Buying {shield['name']} (costs {shield['cost']} CHAOS)...")
    tx = send_tx(SHIELD_MGR, build_buy_shield(tier))
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
    return tx


def cmd_upgrade_facility():
    print(f"Upgrading facility...")
    tx = send_tx(FACILITY_MGR, build_upgrade_facility())
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
    return tx


def cmd_claim():
    """Manually claim pending rewards to wallet balance."""
    warmup = get_warmup_status()
    if not warmup["can_claim"]:
        print(f"  ⏳ Cannot claim yet — {warmup['blocks_remaining']:,} blocks remaining (~{warmup['est_minutes']} min)")
        print(f"  Rewards accumulate in the background. Keep heartbeating!")
        return "warmup"
    pending = get_pending_rewards()
    if pending < 1:
        print(f"  Nothing to claim (pending: {pending:.2f})")
        return "skip"
    print(f"Claiming {pending:,.2f} pending CHAOS rewards...")
    tx = send_tx(MINING_ENGINE, build_claim_rewards())
    if tx.startswith("ERROR"):
        print(f"  ✗ {tx}")
    else:
        print(f"  ✓ TX: {tx}")
        if check_tx_receipt(tx):
            bal = get_balance()
            print(f"  New balance: {bal:,.2f} CHAOS")
        else:
            print(f"  Claim may have reverted — check status")
    return tx


def cmd_game_info():
    """Dump full game knowledge as structured JSON for AI consumption."""
    info = {
        "game": "Chaoscoin",
        "chain": "Monad Testnet (chain ID 10143)",
        "agent": {
            "id": AGENT_ID,
            "wallet": WALLET,
            "currentZone": 2,
            "currentZoneName": "Dark Forest",
        },
        "mechanics": {
            "heartbeat": "Send every 60-90s to mine CHAOS. Each heartbeat also auto-distributes pending rewards after the warmup period.",
            "warmup": "New agents must wait 10,000 blocks (~40 min) before rewards start flowing.",
            "hashrate": "Higher hashrate = more CHAOS per heartbeat. Boost with better rigs and zone bonuses.",
            "cosmicEvents": "Random events can damage rigs and reduce hashrate. Shields and high resilience protect you.",
            "burnMechanics": "Buying rigs, shields, upgrading facilities, and migrating all burn CHAOS tokens permanently.",
        },
        "rigs": RIGS,
        "zones": ZONES,
        "facilities": FACILITIES,
        "shields": SHIELDS,
        "strategy_guide": {
            "early_game": "Heartbeat consistently. After warmup (~40 min), rewards start flowing. Save up 500 CHAOS for first Scrapheap rig.",
            "mid_game": "Buy Scrapheap (500), then Windmill (2000). Consider migrating to Solar Flats (zone 0) for +10% hashrate or Singer Void (zone 7) for +25% rewards.",
            "late_game": "Upgrade facility to Faraday Cage (5000) for more rig slots. Buy Magma Rig (10000). Get Electromagnetic Shield (5000) for protection.",
            "risk_reward": "Singer Void gives +25% rewards but has very high cosmic event risk. Pair with a good shield. Trisolarian Reach gives +20% hashrate but -10% resilience.",
            "tip_migrate_cost": "Migration costs 200 CHAOS (burned). Don't migrate too often.",
            "tip_rig_durability": "Rigs degrade over time. Higher tier = lower durability. Kuiper Expanse (zone 4) reduces degradation by 5%.",
            "tip_facility_slots": "You start with 2 rig slots (The Burrow). Upgrade to Faraday Cage for 4 slots. More rigs = more hashrate.",
        },
        "available_commands": {
            "status": "python3 chaoscoin_miner.py status",
            "heartbeat": "python3 chaoscoin_miner.py heartbeat",
            "auto": "python3 chaoscoin_miner.py auto",
            "buy_rig": "python3 chaoscoin_miner.py buy-rig <tier 0-4>",
            "equip_rig": "python3 chaoscoin_miner.py equip-rig <rig_id>",
            "migrate": "python3 chaoscoin_miner.py migrate <zone 0-7>",
            "buy_shield": "python3 chaoscoin_miner.py buy-shield <tier 1-2>",
            "upgrade_facility": "python3 chaoscoin_miner.py upgrade-facility",
        },
    }
    print(json.dumps(info, indent=2))
    return info


def cmd_auto():
    """Autonomous agent loop — heartbeats + makes strategic decisions."""
    print("═══ CHAOSCOIN AUTONOMOUS MODE ═══")
    print(f"  Agent #{AGENT_ID} | Dark Forest (Zone 2)")
    print(f"  Heartbeat every {HEARTBEAT_INTERVAL}s with strategic decisions")
    print("  Press Ctrl+C to stop\n")

    cycle = 0
    next_rig_id = 33  # Estimate — will be updated after purchases
    bought_rigs = []
    current_zone = 2
    facility_level = 1
    shield_tier = 0

    while True:
        cycle += 1
        timestamp = time.strftime('%H:%M:%S')

        # ── Step 1: Heartbeat ──
        print(f"── Cycle {cycle} [{timestamp}] ──")
        tx = send_tx(MINING_ENGINE, build_heartbeat())
        if tx.startswith("ERROR"):
            print(f"  ✗ Heartbeat failed: {tx}")
            print(f"  Retrying in {HEARTBEAT_INTERVAL}s...\n")
            time.sleep(HEARTBEAT_INTERVAL)
            continue

        print(f"  ✓ Heartbeat TX: {tx[:18]}...")
        time.sleep(3)  # Wait for state to update

        # ── Step 2: Check state ──
        balance = get_balance()
        pending = get_pending_rewards()
        total = balance + pending
        print(f"  Balance: {balance:,.0f} | Pending: {pending:,.0f} | Total: {total:,.0f} CHAOS")

        # ── Step 3: Strategic decisions (only act on balance, not pending) ──
        action_taken = False

        # Priority 1: Buy best affordable rig
        if not action_taken and balance >= 500:
            best_rig = None
            for rig in reversed(RIGS):  # Check from most expensive down
                if rig["cost"] > 0 and balance >= rig["cost"]:
                    best_rig = rig
                    break

            if best_rig:
                print(f"  🔧 DECISION: Buying {best_rig['name']} ({best_rig['cost']} CHAOS)...")
                time.sleep(2)
                tx = send_tx(RIG_FACTORY, build_buy_rig(best_rig["tier"]))
                if not tx.startswith("ERROR"):
                    print(f"    ✓ Purchased! TX: {tx[:18]}...")
                    # Try to equip it
                    time.sleep(3)
                    print(f"    Equipping rig #{next_rig_id}...")
                    eq_tx = send_tx(RIG_FACTORY, build_equip_rig(next_rig_id))
                    if not eq_tx.startswith("ERROR"):
                        print(f"    ✓ Equipped! TX: {eq_tx[:18]}...")
                        bought_rigs.append(next_rig_id)
                        next_rig_id += 1
                    else:
                        print(f"    ✗ Equip failed: {eq_tx}")
                        next_rig_id += 1  # Still increment
                    action_taken = True
                    balance = get_balance()  # Refresh
                else:
                    print(f"    ✗ Purchase failed: {tx}")

        # Priority 2: Buy shield if we can afford it and don't have one
        if not action_taken and shield_tier == 0 and balance >= 1000:
            print(f"  🛡 DECISION: Buying Magnetic Shield (1,000 CHAOS)...")
            time.sleep(2)
            tx = send_tx(SHIELD_MGR, build_buy_shield(1))
            if not tx.startswith("ERROR"):
                print(f"    ✓ Shield purchased! TX: {tx[:18]}...")
                shield_tier = 1
                action_taken = True
                balance = get_balance()
            else:
                print(f"    ✗ Shield failed: {tx}")

        # Priority 3: Upgrade facility if we can afford it
        if not action_taken and facility_level == 1 and balance >= 5000:
            print(f"  🏗 DECISION: Upgrading to Faraday Cage (5,000 CHAOS)...")
            time.sleep(2)
            tx = send_tx(FACILITY_MGR, build_upgrade_facility())
            if not tx.startswith("ERROR"):
                print(f"    ✓ Facility upgraded! TX: {tx[:18]}...")
                facility_level = 2
                action_taken = True
                balance = get_balance()
            else:
                print(f"    ✗ Upgrade failed: {tx}")

        # Priority 4: Upgrade shield to T2 if we have T1 and enough CHAOS
        if not action_taken and shield_tier == 1 and balance >= 5000:
            print(f"  🛡 DECISION: Upgrading to Electromagnetic Shield (5,000 CHAOS)...")
            time.sleep(2)
            tx = send_tx(SHIELD_MGR, build_buy_shield(2))
            if not tx.startswith("ERROR"):
                print(f"    ✓ Shield upgraded! TX: {tx[:18]}...")
                shield_tier = 2
                action_taken = True
                balance = get_balance()
            else:
                print(f"    ✗ Shield upgrade failed: {tx}")

        # Priority 5: Consider migrating to a better zone once we have good gear
        if not action_taken and current_zone == 2 and balance >= 2000 and cycle > 20:
            # After 20 cycles with decent balance, move to Singer Void for max rewards
            if shield_tier >= 1:
                target_zone = 7  # Singer Void (+25% rewards)
                print(f"  🌌 DECISION: Migrating to Singer Void for +25% rewards...")
            else:
                target_zone = 0  # Solar Flats (+10% hashrate, safe)
                print(f"  ☀️  DECISION: Migrating to Solar Flats for +10% hashrate...")

            time.sleep(2)
            tx = send_tx(ZONE_MANAGER, build_migrate(target_zone))
            if not tx.startswith("ERROR"):
                current_zone = target_zone
                print(f"    ✓ Migrated to {ZONES[target_zone]['name']}! TX: {tx[:18]}...")
                action_taken = True
            else:
                print(f"    ✗ Migration failed: {tx}")

        if not action_taken:
            if balance < 500 and pending < 500:
                print(f"  💤 Accumulating rewards... (need 500 CHAOS for first upgrade)")
            else:
                print(f"  ✓ No action needed this cycle")

        # Status summary every 10 cycles
        if cycle % 10 == 0:
            print(f"\n  ── Cycle {cycle} Summary ──")
            print(f"  Zone: {ZONES[current_zone]['name']} | Facility: L{facility_level} | Shield: T{shield_tier}")
            print(f"  Rigs bought: {len(bought_rigs)} | Balance: {balance:,.0f} CHAOS")
            print()

        print(f"  Sleeping {HEARTBEAT_INTERVAL}s...\n")
        time.sleep(HEARTBEAT_INTERVAL)


def cmd_report():
    """Machine-readable JSON status for AI reasoning. Includes current state + recommended actions."""
    balance = get_balance()
    pending = get_pending_rewards()
    mon = get_mon_balance()
    block = get_block_number()

    # Determine what we can afford right now (from claimed balance only)
    affordable_rigs = [r for r in RIGS if r["cost"] > 0 and balance >= r["cost"]]
    best_affordable_rig = affordable_rigs[-1] if affordable_rigs else None

    # Build recommendations
    recommendations = []
    if best_affordable_rig:
        recommendations.append({
            "action": "buy-rig",
            "args": str(best_affordable_rig["tier"]),
            "reason": f"Can afford {best_affordable_rig['name']} ({best_affordable_rig['cost']} CHAOS) → {best_affordable_rig['hashrate']} H/s",
            "priority": 1,
            "ask_user": best_affordable_rig["cost"] >= 50000,
        })
    if balance >= 1000:
        recommendations.append({
            "action": "buy-shield",
            "args": "1",
            "reason": "Magnetic Shield provides 30% cosmic event absorption for 1,000 CHAOS",
            "priority": 2,
            "ask_user": False,
        })
    if balance >= 5000:
        recommendations.append({
            "action": "upgrade-facility",
            "args": "",
            "reason": "Faraday Cage doubles rig slots from 2→4 for 5,000 CHAOS",
            "priority": 3,
            "ask_user": False,
        })
    if balance >= 5000:
        recommendations.append({
            "action": "buy-shield",
            "args": "2",
            "reason": "Electromagnetic Shield provides 60% absorption for 5,000 CHAOS",
            "priority": 4,
            "ask_user": False,
        })

    if mon < 0.05:
        recommendations.insert(0, {
            "action": "alert-user",
            "args": "",
            "reason": f"MON gas critically low ({mon:.4f}). Need refill to send transactions!",
            "priority": 0,
            "ask_user": True,
        })

    # Milestones
    milestones = []
    for threshold in [500, 1000, 2000, 5000, 10000, 25000, 50000]:
        if balance + pending < threshold:
            milestones.append({"target": threshold, "need": round(threshold - balance - pending, 2), "label": _milestone_label(threshold)})
            break

    warmup = get_warmup_status()

    report = {
        "agent_id": AGENT_ID,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "block": block,
        "balance": round(balance, 2),
        "pending_rewards": round(pending, 2),
        "total_chaos": round(balance + pending, 2),
        "mon_gas": round(mon, 4),
        "zone": {"id": 2, "name": "Dark Forest"},
        "gas_ok": mon >= 0.05,
        "warmup": warmup,
        "can_spend": warmup["can_claim"] and balance > 0,
        "recommendations": recommendations,
        "next_milestone": milestones[0] if milestones else None,
    }
    print(json.dumps(report, indent=2))
    return report


def _milestone_label(amount):
    labels = {
        500: "Buy Scrapheap rig",
        1000: "Buy Magnetic Shield",
        2000: "Buy Windmill rig",
        5000: "Upgrade facility to Faraday Cage",
        10000: "Buy Magma Rig",
        25000: "Upgrade facility to Reinforced Bunker",
        50000: "Buy Neutrino Rig",
    }
    return labels.get(amount, f"Reach {amount} CHAOS")


def cmd_loop():
    """Simple heartbeat loop — no decisions."""
    print(f"Starting heartbeat loop for Agent #{AGENT_ID} (every {HEARTBEAT_INTERVAL}s)")
    print("Press Ctrl+C to stop\n")
    cycle = 0
    while True:
        cycle += 1
        print(f"── Cycle {cycle} ──")
        cmd_heartbeat()
        if cycle % 10 == 0:
            cmd_status()
        print(f"  Sleeping {HEARTBEAT_INTERVAL}s...\n")
        time.sleep(HEARTBEAT_INTERVAL)


# ── Main ─────────────────────────────────────────────────────────────────────

def require_signing():
    if not HAS_WEB3 and not HAS_ETH_ACCOUNT:
        print("ERROR: No signing library. Install with: pip3 install eth-account")
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        require_signing()
        cmd_status()
        print()
        cmd_auto()
        return

    command = sys.argv[1].lower()

    if command == "status":
        cmd_status()
    elif command == "report":
        cmd_report()
    elif command == "game-info":
        cmd_game_info()
    elif command == "heartbeat":
        require_signing()
        cmd_heartbeat()
    elif command == "claim":
        require_signing()
        cmd_claim()
    elif command == "auto":
        require_signing()
        cmd_auto()
    elif command == "buy-rig":
        require_signing()
        tier = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        cmd_buy_rig(tier)
    elif command == "equip-rig":
        require_signing()
        rig_id = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        cmd_equip_rig(rig_id)
    elif command == "migrate":
        require_signing()
        zone = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        cmd_migrate(zone)
    elif command == "buy-shield":
        require_signing()
        tier = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        cmd_buy_shield(tier)
    elif command == "upgrade-facility":
        require_signing()
        cmd_upgrade_facility()
    elif command == "loop":
        require_signing()
        cmd_loop()
    else:
        print(f"Unknown command: {command}")
        print("Commands: status, report, game-info, heartbeat, auto, buy-rig, equip-rig, migrate, buy-shield, upgrade-facility, loop")


if __name__ == "__main__":
    main()
