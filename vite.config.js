import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages は「ユーザー名.github.io/リポジトリ名/」というサブフォルダURLで公開される。
  // base を './'（相対パス）にしておくと、どんなURLでも assets を正しく読み込める。
  base: './',
  plugins: [react()],
})
