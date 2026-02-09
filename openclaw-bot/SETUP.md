# Setup

## What you're doing

You have an OpenClaw bot on a cloud machine accessible via Telegram. You're going to paste two markdown files into its workspace so it knows how to play Chaoscoin autonomously.

## Step 1: Paste AGENTS.md

Copy the entire contents of `AGENTS.md` and send this to your bot:

> Write the following to `~/.openclaw/workspace/AGENTS.md` exactly as-is:

Then paste the whole file.

This gives the bot its identity, game knowledge, strategy, and a Python script it will self-create on first run. The bot reads this file on every turn automatically.

## Step 2: Paste HEARTBEAT.md

Copy the entire contents of `HEARTBEAT.md` and send this to your bot:

> Write the following to `~/.openclaw/workspace/HEARTBEAT.md` exactly as-is:

Then paste the whole file.

This tells the bot what to do on each periodic heartbeat check.

## That's it

The bot will:
1. See the AGENTS.md instructions on its next message
2. Create `~/chaos.py` and install `eth-account` automatically (the bootstrap section tells it to)
3. Start following the heartbeat checklist every cycle
4. Report back to you through Telegram when things happen

## Try it

After pasting both files, send your bot:

> How's our mining going? Check status.

It should create the script, run it, and report back.
