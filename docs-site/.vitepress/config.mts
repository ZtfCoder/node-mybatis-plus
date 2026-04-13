import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'node-mybatis-plus',
  description: 'MyBatis-Plus 风格的 Node.js ORM 库',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/introduction' },
      { text: 'API 参考', link: '/api/decorators' },
      { text: '设计文档', link: '/design/architecture' },
      { text: 'GitHub', link: 'https://github.com/ZtfCoder/node-mybatis-plus' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '基础',
          items: [
            { text: '项目介绍', link: '/guide/introduction' },
            { text: '为什么选择', link: '/guide/why' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '实体定义', link: '/guide/entity-definition' },
            { text: '数据源配置', link: '/guide/datasource' },
          ],
        },
        {
          text: '核心功能',
          items: [
            { text: 'BaseMapper CRUD', link: '/guide/base-mapper' },
            { text: 'Lambda 链式查询', link: '/guide/lambda-query' },
            { text: '动态条件', link: '/guide/dynamic-condition' },
            { text: 'Lambda 更新', link: '/guide/lambda-update' },
            { text: '分页查询', link: '/guide/pagination' },
            { text: '自定义 SQL', link: '/guide/custom-sql' },
          ],
        },
        {
          text: '高级功能',
          items: [
            { text: '事务管理', link: '/guide/transaction' },
            { text: '插件机制', link: '/guide/plugin' },
            { text: '多数据库切换', link: '/guide/multi-database' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '装饰器', link: '/api/decorators' },
            { text: 'BaseMapper', link: '/api/base-mapper' },
            { text: 'LambdaQueryWrapper', link: '/api/query-wrapper' },
            { text: 'LambdaUpdateWrapper', link: '/api/update-wrapper' },
            { text: '数据源配置', link: '/api/datasource' },
            { text: '插件接口', link: '/api/plugin' },
            { text: '类型定义', link: '/api/types' },
          ],
        },
      ],

      '/design/': [
        {
          text: '设计文档',
          items: [
            { text: '架构概览', link: '/design/architecture' },
            { text: 'SQL AST 设计', link: '/design/sql-ast' },
            { text: '方言系统', link: '/design/dialect' },
            { text: '事务实现', link: '/design/transaction' },
            { text: '插件系统设计', link: '/design/plugin-system' },
          ],
        },
      ],
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭',
            },
          },
        },
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ZtfCoder/node-mybatis-plus' },
    ],
  },
})
