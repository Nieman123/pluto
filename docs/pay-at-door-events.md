# Pay-at-the-door event listings

For events where the venue collects admission and Pluto sells no tickets:

1. Open the event in Event Studio.
2. Set **Event registration** to **Pay at the door · No online sales**.
3. Enter **Door price in USD** (for example, `5` for $5). The price must be positive, with at most two decimal places.
4. Optionally enter **Admission notes**, such as “Admission handled by the venue” or “Cash only.” Notes are plain text, support line breaks, and allow up to 1,000 characters.
5. Add the public venue, address, and directions. Save the draft, preview it, and publish.

The admission panel shows **PAY AT THE DOOR**, **$5 entry.**, the explanation that guests pay at the venue without advance tickets or RSVP, and the optional notes. Website and Flutter event cards show the door price and use **View event**. Search metadata does not label the event as free or advertise online ticket offers.

After publication, the event dashboard's **Event setup** lets managers update the door price and notes immediately using **Save event settings**. Event Studio edits remain drafts until published.

Selecting this mode makes directions public, disables ticket types and waitlists, and replaces the generated free/ticket FAQ with door-admission wording. Custom FAQ content is preserved; check it for outdated admission instructions. Existing orders remain valid. New Stripe, cash, comp, RSVP, and native checkout handoffs are blocked. Pluto does not collect or report the venue's door payments.

Use **Free event · Just show up** for genuinely free admission, and **Ticketed event** when Pluto should sell or issue admission tickets.

## Verification

Unit tests cover price validation, public data, and disabled registration. `npm run test:ticketing:free` covers free and door-only publication, checkout rejection, notes escaping, live updates, history restore, and cancellation against isolated emulators. The `door-events-browser` CI scenario covers creation, conversion from free, publication, post-publication edits, responsive accessibility, and Flutter labels.
