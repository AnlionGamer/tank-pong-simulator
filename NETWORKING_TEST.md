# Tank Pong Local Multiplayer — Connection Proof

This branch tests direct local WebRTC connectivity before gameplay synchronization is added.

## Scope

- No Supabase, Firebase, Cloudflare game server, database, or account.
- WebRTC `RTCDataChannel` only.
- `iceServers: []` so the build does not use configured STUN/TURN services.
- Exchanged SDP is filtered to `host` ICE candidates only.
- Manual offer/response codes are used for the first proof because they are the smallest reliable signaling surface to test before QR pairing is added.
- This build does **not** synchronize tanks yet.

## Two-phone test

1. Put both phones on the same normal Wi-Fi network.
2. Open Tank Pong on both phones.
3. Player 1: Multiplayer → Create Local Match → Create Offer Code → Copy Offer.
4. Transfer that offer code to Player 2 and paste it into Join Local Match.
5. Player 2: Create Response Code → Copy Response.
6. Transfer the response back to Player 1.
7. Player 1: paste the response → Complete Connection.
8. Both phones should show a connected local state.
9. Press **Ping Other Phone** from each device several times.
10. Confirm round-trip latency appears and message counters increase.
11. Disconnect and reconnect at least twice.

## Next stage after acceptance

Once direct connection and ping are reliable on the two target phones, add host-authoritative Tank Pong state synchronization and then replace/manual-augment pairing with QR scanning for convenience.
