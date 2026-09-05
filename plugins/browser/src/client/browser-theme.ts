import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'

/** Browser-only palette, composed by the public theme service, including portals. */
export const BROWSER_THEME: ThemeTokenOverrides = {
  '--dsw-alias-bg-base': { light: '#fafafa', dark: '#131313' },
  '--dsw-alias-bg-layer-1': { light: '#f4f4f4', dark: '#191919' },
  '--dsw-alias-bg-layer-2': { light: '#ffffff', dark: '#222222' },
  '--dsw-alias-bg-layer-3': { light: '#ffffff', dark: '#282828' },
  '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#242424' },
  '--dsw-alias-label-primary': { light: '#242424', dark: '#f0f0f0' },
  '--dsw-alias-label-secondary': { light: '#737373', dark: '#a3a3a3' },
  '--dsw-alias-label-tertiary': { light: '#858585', dark: '#898989' },
  '--dsw-alias-label-caption': { light: '#858585', dark: '#898989' },
  '--dsw-alias-border-l1': { light: '#e4e4e4', dark: '#2e2e2e' },
  '--dsw-alias-border-l2': { light: '#d8d8d8', dark: '#3b3b3b' },
  '--dsw-alias-border-l2-darkmode-thin': { light: '#dedede', dark: '#363636' },
  '--dsw-alias-brand-primary': { light: '#2967df', dark: '#91b1ff' },
  '--dsw-alias-interactive-bg-hover': { light: '#ededed', dark: '#2b2b2b' },
  '--dsw-alias-button-info-fill': { light: '#2865de', dark: '#477af0' },
  '--dsw-alias-button-info-hover': { light: '#2058c4', dark: '#5687f7' },
  '--dsw-specific-input-major': { light: '#ffffff', dark: '#1b1b1b' },
  '--dsw-specific-bubble': { light: '#f0f0f0', dark: '#262626' },
  '--dsw-specific-menu': { light: '#ffffff', dark: '#242424' },
  '--dsw-specific-selector': { light: '#f0f0f0', dark: '#303030' },
  '--dsw-shadow-lv1': { light: 'none', dark: 'none' },
  '--dsw-shadow-lv1-blur': { light: 'none', dark: 'none' },
  '--dsw-shadow-lv2': { light: 'none', dark: 'none' },
  '--dsw-shadow-lv3': { light: '0 4px 12px #0000000d', dark: '0 4px 12px #00000026' },
}
