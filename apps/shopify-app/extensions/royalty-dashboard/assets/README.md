# assets

このApp Home UI Extensionは静的アセット（画像など）を持たないが、`shopify.extension.toml`の`assets = "./assets"`がこのディレクトリの存在を前提にしているため、git管理下に残すためのプレースホルダーを置いている。

`.gitkeep`は使わない。Shopifyのアセットバリデーションが拡張子を`.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`/`.avif`/`.ico`/`.txt`/`.md`/`.json`に限定しており、`.gitkeep`は`shopify app deploy`で「unsupported file type」エラーになる。
