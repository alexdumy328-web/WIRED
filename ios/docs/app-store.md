# Shipping to the App Store

## What it costs

| Item | Cost |
| --- | --- |
| Apple Developer Program | 99 USD a year (billed in local currency, VAT may apply). Confirm the current price at developer.apple.com/programs when you enrol. This is the only required cost. |
| D-U-N-S number (needed to enrol as a company, such as an SRL) | Free. Apple's lookup tool requests it and it takes days to a few weeks. |
| TestFlight (up to 10,000 testers, 90-day builds) | Free, included. |
| Commission | None. The app sells no digital goods. Repairs are physical services paid outside the app. |
| Mac and Xcode | Already owned. |
| Screenshots, listing, review | Free. |
| Privacy policy and terms pages | Hosted on the existing website. A lawyer's review is optional. |
| Google Play later | 25 USD once. |

All in for the first year: about 99 USD, plus your own time. Enrol as the company if you want "Norgelis Tech" shown as the seller. An individual enrolment shows a personal name.

## Before the first submission

These need a decision or a change outside the app.

1. **Real production address.** Set `NORGELIS_API_BASE_URL` (the default `https://norgelis.ro` is a placeholder). It must be HTTPS and the server must trust the app (see the Origin note in the README).
2. **Account deletion in the app.** App Store guideline 5.1.1(v) requires it for apps that create accounts. Enable Better Auth's `user.deleteUser` on the server so `POST /api/auth/delete-user` works. Until then the app falls back to an email request, which review may reject.
3. **Privacy policy URL** (required) and a terms page. Set `NORGELIS_PRIVACY_URL` and `NORGELIS_TERMS_URL`. The site has neither page yet.
4. **Real contact details.** Set `NORGELIS_SUPPORT_EMAIL`, `NORGELIS_PHONE` and `NORGELIS_DRIVER_PHONE`. The site's phone number is still a placeholder.
5. **Demo account for App Review.** Review cannot receive your email codes. Create a customer account with a password and a staff (technician) account with a password, verified on the server, and list both in App Store Connect → App Review Information. Say that the driver map needs a pickup booked for today.
6. **Apple Developer team.** Put the team id in `DEVELOPMENT_TEAM` (or pick it in Xcode), keep automatic signing, and raise `CURRENT_PROJECT_VERSION` for each upload.
7. **Google sign-in.** Not in the app. If you add it, Apple also requires Sign in with Apple (guideline 4.8).

## App Store Connect answers

- **Name:** Norgelis Tech. **Category:** Business (or Utilities). **Price:** free. **Age rating:** 4+.
- **Privacy nutrition labels** (match `PrivacyInfo.xcprivacy`): data collected and linked to the user, used for app functionality only, no tracking: email address, name, phone number, physical address (pickup address), user ID. Location is read on the device for the route and not sent anywhere.
- **Encryption:** the app uses only HTTPS, so `ITSAppUsesNonExemptEncryption` is false and no export paperwork is needed.
- **Required reason APIs:** UserDefaults (reason `CA92.1`) is declared.
- **Location text:** "while using the app" only. No background mode is declared (see the README).
- **Support URL:** the website or a contact page.
- **Screenshots:** iPhone 6.9 inch (and 6.5 inch if asked). The app is iPhone only. The `docs/screenshots/prod-*.png` files are simulator captures to start from.

## Release steps

1. Set the build settings above and bump the build number.
2. Xcode → Product → Archive (Release configuration), then Distribute → App Store Connect.
3. Add the build to TestFlight and test with the owners' phones (internal testing needs no review).
4. Submit for review from App Store Connect.

## What review looks at, and where the app stands

- Crashes and broken flows: the booking, sign-in and tracking flows were run in the simulator against a local server.
- Login: needs the demo account above.
- Permissions: one location prompt with a plain reason, asked when the Driver tab opens.
- Placeholder content: the sample-data mode is hidden from customers and technicians and off by default. The shop phone and the support email stay hidden until set.
- iPad: not supported. Add iPad layouts before turning iPad on.
