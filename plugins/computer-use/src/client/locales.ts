export const zh = {
  'title': 'Computer Use',
  'description': '允许智能体通过 Open Computer Use 操作本机应用。macOS 缺少辅助功能或屏幕录制权限时，会在首次执行 Computer Use 任务时打开授权引导。',
  'enabled': 'Computer Use 已开启',
  'disabled': 'Computer Use 已关闭',
  'loading': '正在读取 Computer Use 设置',
  'unavailable': 'Computer Use 设置当前不可用',
} satisfies Record<string, string>

export type ComputerUseLocaleKey = keyof typeof zh

export const en = {
  'title': 'Computer Use',
  'description': 'Let agents control local apps through Open Computer Use. On macOS, missing Accessibility or Screen Recording access is requested on the first Computer Use task.',
  'enabled': 'Computer Use is on',
  'disabled': 'Computer Use is off',
  'loading': 'Loading the Computer Use setting',
  'unavailable': 'The Computer Use setting is unavailable',
} satisfies Record<ComputerUseLocaleKey, string>
