# Iter Prompt project

Work from this repository root. The application is a local visual prompt iteration studio built with Node.js and browser JavaScript.

- Use `npm start` for the local app and `npm run dev` while editing the server.
- Run `npm run check` and relevant `npm test` checks after meaningful code changes.
- Keep the original reference and brief fixed once an output exists. Branch to change a completed prompt; never inherit scores for a new output.
- Distinguish illustration fixtures, human scores, and AI estimates in the interface and documentation.
- Keep credentials in server environment variables. Never commit `.env`, `.data`, user images, or exported experiments.
- Do not make paid model requests as part of automated tests. Use an injectable provider or transport.
- The May–October history is retrospective. Preserve the provenance notices. Use current dates for future work unless the user explicitly asks for additional reconstruction.
- This is a single-user local app. Do not publish it or push the repository unless the user requests that.
