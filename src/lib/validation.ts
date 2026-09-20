import { z } from "zod";

// Synapse uses Italian for both explicit messages and Zod's built-in errors.
z.config(z.locales.it());

export { z };
