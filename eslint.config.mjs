import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const NO_NATIVE_TITLE_RULE = 'no-native-title-tooltip'

const noNativeTitleTooltipRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow native title attributes on HTML elements; use WithTooltip or TooltipIconButton instead.',
    },
    schema: [],
    messages: {
      noNativeTitleTooltip:
        'Native title tooltips are replaced by the custom Radix tooltip. Use WithTooltip or TooltipIconButton instead, or keep title only on iframes for accessibility.',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'title') return
        const openingElement = node.parent
        if (openingElement.type !== 'JSXOpeningElement') return
        const elementName = openingElement.name
        if (elementName.type !== 'JSXIdentifier') return
        const tagName = elementName.name
        // Only enforce on lowercase HTML elements. Custom component props named
        // `title` (e.g. DialogTitle, SectionBlock) are still allowed.
        if (tagName === tagName.toLowerCase() && tagName !== 'iframe') {
          context.report({
            node,
            messageId: 'noNativeTitleTooltip',
          })
        }
      },
    }
  },
}

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'electron/**/*.cjs'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: [
      'electron/discordRpc/rpcClient.ts',
      'electron/tools/computer-use/actions.ts',
      'electron/updater.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
    plugins: {
      local: {
        rules: {
          [NO_NATIVE_TITLE_RULE]: noNativeTitleTooltipRule,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'local/no-native-title-tooltip': 'error',
    },
  },
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      'build/**',
      'out/**',
      'coverage/**',
      '*.config.{js,ts,mjs}',
    ],
  }
)
