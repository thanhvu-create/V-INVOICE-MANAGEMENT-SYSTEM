# Quy chuẩn Mã Xoàn (Gem Code Convention)

## Format
```
{TYPE}-{LOT_ID} {SIZE}       ← size sau space
{TYPE}-{LOT_ID}-{SIZE}       ← size sau dash cuối
{TYPE}-{LOT_ID}              ← không có size (nhập thủ công)
```

## Natural vs Lab-grown

| Pattern | Loại | Ví dụ |
|---|---|---|
| `{TYPE}-{số}...` | Natural | `RD-11119-2.1`, `BG-5528` |
| `{TYPE}-L{số}...` | Lab-grown | `PR-L18 1.6*1.6`, `BG-L14` |
| `L-{TYPE}...` | Lab-grown (alt) | `L-RD409-2.1` |

**Quy tắc:** Sau `-` đầu tiên, bắt đầu bằng `L` + số → lab-grown.

## Stone Type Mapping

| Prefix | Natural → DB | Lab-grown → DB |
|---|---|---|
| RD | `RD` | `RD-LG` |
| PR | `PR` | `LG-PR` |
| BG | `BG` | `LG-BG` |
| MQ | `MQ` | `LG-MQ` |
| PS | `PS` | `LG-PS` |
| OV | `OV` | `LG-OV` |
| HS | — | `LG-HS` |
| TD | — | `LG-TD` |
| BQT | `BQT` | — |
| XC | `XC` | — |
| PL/PEARL | `PEARL` | — |
| RRB | `RRB-N` | — |
| RDCZ | `RD` | — |

## Size Extraction

1. Split by space → last token numeric? → size (e.g. `PR-L18 1.6*1.6` → `1.6*1.6`)
2. Else split by `-` → last segment starts with digit? → size (e.g. `RD-11119-2.1` → `2.1`)
3. PR/Princess: `W*W` format → take first dimension

## Implementation
- `detectStoneType()` — `lib/formulas/size-mapping.ts`
- `extractSizeFromCode()` — `components/invoice/GemModal.tsx`
- `parseSizeValue()` — `lib/formulas/size-mapping.ts`
- DB lookup: `/api/nvl-hot?type={stone_type}&size={value}`
