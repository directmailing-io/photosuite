import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F6F6F2",
        paper: "#FFFFFF",
        linen: "#ECEBE8",
        stone: "#DFDEDA",
        smoke: "#7D7878",
        taupe: "#9F877F",
        ink: "#19191A",
        accent: {
          DEFAULT: "#C8102E",
          soft: "#FBE9EC",
          deep: "#9C0822",
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Open Sans"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        ui: ['"Montserrat"', '"Open Sans"', "sans-serif"],
      },
      letterSpacing: {
        eyebrow: "0.24em",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(25,25,26,0.04), 0 1px 1px rgba(25,25,26,0.03)",
        md: "0 6px 20px rgba(25,25,26,0.08), 0 2px 6px rgba(25,25,26,0.04)",
        lg: "0 28px 64px rgba(25,25,26,0.16), 0 8px 16px rgba(25,25,26,0.08)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
