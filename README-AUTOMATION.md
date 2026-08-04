Automation & Integration Notes

Environment variables required for new automation features:

- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` — for Twitch Helix API
- `TWITCH_CHANNEL` — default Twitch channel used by poller (optional, defaults to Veiltactician)
- `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` — for posting to Facebook page
- `AMAZON_AFFILIATE_TAG` — affiliate tag appended to Amazon links (e.g., your-tag-20)
- `PRINTFUL_API_KEY` — for Printful P.O.D. integration (optional)

Run the scheduler once:

```bash
cd PulsePlay-api
npm run scheduler
```

You can run this periodically with cron, systemd timers, or a hosted scheduler.
