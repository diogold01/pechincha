import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F4F5F9",
        card: "#FFFFFF",
        border: "#E4E6EE",
        text: {
          main: "#14171F",
          muted: "#5B6270",
        },
        primary: {
          DEFAULT: "#3B4CCA",
          hover: "#2F3DA8",
          light: "#E8EBFC",
          soft: "#DDE2FF",
        },
        budget: {
          green: {
            DEFAULT: "#1F9D57",
            bg: "#E8F7EE",
            text: "#126A3A",
          },
          yellow: {
            DEFAULT: "#E8A200",
            bg: "#FFF3D6",
            text: "#7A5000",
          },
          red: {
            DEFAULT: "#D64545",
            bg: "#FCEBEA",
            text: "#B3261E",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        btn: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
