# Analytics (GitHub Pages 版本)

這是給新手的「處置預警 + 技術指標」靜態網站版。

## 功能

- 候選池：處置預警網站（chengwaye）
- 指標：位階（布林）、月線斜率、上軌斜率
- 推薦分級：A/B/C
- 介面：可用篩選快速看「位階 4~6」

## 本機執行

```bash
npm ci
npm run build:data
npm start
```

打開 `http://localhost:3000`。

## 部署到 GitHub Pages

1. 推到 GitHub repository
2. 到 Settings > Pages
3. Source 選 `Deploy from a branch`
4. Branch 選 `main`，Folder 選 `/docs`
5. Save

## 自動更新資料

- 已附 `/.github/workflows/update-data.yml`
- 每個交易日會自動更新 `docs/data.json`
- 也可以手動在 Actions 觸發 `Update stock data`

## 指標說明

- 位階：中線 = 0，上軌 = 10，下軌 = -10
- 月線斜率：`(今天月線 - 昨天月線) / 昨天月線`
- 上軌斜率：`(今天上軌 - 昨天上軌) / 昨天上軌`
