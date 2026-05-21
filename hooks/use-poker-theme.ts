import { InputTypography, Radius, Spacing, Typography } from "@/constants/theme";
import { useThemeContext } from "@/store/ThemeContext";

export function usePokerTheme() {
  const { colors, isDark, preference } = useThemeContext();
  return {
    colors,
    spacing: Spacing,
    radius: Radius,
    typography: Typography,
    inputTypo: InputTypography,
    isDark,
    scheme: preference,
  };
}
