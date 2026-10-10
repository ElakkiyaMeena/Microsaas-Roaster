import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: true,
};

/** Fiery "roast" palette centred on #FF5A1F (brand.500). */
const colors = {
  brand: {
    50: '#FFF1EB',
    100: '#FFD9C7',
    200: '#FFBC9E',
    300: '#FF9A70',
    400: '#FF7A45',
    500: '#FF5A1F',
    600: '#E04411',
    700: '#B8340B',
    800: '#8C2708',
    900: '#5E1A05',
  },
  accent: {
    50: '#FFE8F1',
    100: '#FFC2DA',
    200: '#FF99C1',
    300: '#FF70A8',
    400: '#FF4D93',
    500: '#F02D7D',
    600: '#C91F66',
    700: '#9E164F',
    800: '#730F39',
    900: '#4A0824',
  },
  ember: {
    500: '#FFB020',
  },
};

const fonts = {
  heading: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  body: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  mono: `'JetBrains Mono', 'Fira Code', SFMono-Regular, Menlo, Consolas, monospace`,
};

const theme = extendTheme({
  config,
  colors,
  fonts,
  semanticTokens: {
    colors: {
      'bg.canvas': { default: 'gray.50', _dark: 'gray.900' },
      'bg.surface': { default: 'whiteAlpha.800', _dark: 'whiteAlpha.100' },
      'border.subtle': { default: 'blackAlpha.100', _dark: 'whiteAlpha.200' },
      'text.primary': { default: 'gray.800', _dark: 'gray.100' },
      'text.muted': { default: 'gray.600', _dark: 'gray.400' },
    },
  },
  styles: {
    global: {
      // Background only on <html> so fixed decorative layers (MeshBackground, z-index -1)
      // paint above it and below page content.
      html: {
        bg: 'bg.canvas',
        minHeight: '100%',
      },
      body: {
        bg: 'transparent',
        color: 'text.primary',
        minHeight: '100%',
      },
      '::selection': {
        bg: 'brand.200',
        color: 'gray.900',
      },
    },
  },
  shadows: {
    glow: '0 10px 30px -10px rgba(255, 90, 31, 0.6)',
  },
  components: {
    Button: {
      defaultProps: { colorScheme: 'brand' },
      baseStyle: { borderRadius: 'full', fontWeight: 'semibold' },
    },
    Input: {
      defaultProps: { focusBorderColor: 'brand.400' },
    },
    Textarea: {
      defaultProps: { focusBorderColor: 'brand.400' },
    },
    Select: {
      defaultProps: { focusBorderColor: 'brand.400' },
    },
    Link: {
      baseStyle: { color: 'brand.500' },
    },
  },
});

export default theme;
