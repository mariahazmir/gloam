# Validation

Results are estimates from map data. They describe which streets are likely well lit or likely dark, and they can be wrong.

## Segments per class

| City | tagged_lit | tagged_unlit | untagged |
|---|---|---|---|
| berlin | 11602 | 1215 | 3851 |
| kl | 133 | 12 | 10080 |
| london | 7969 | 423 | 6904 |
| manchester | 7085 | 219 | 14488 |
| seattle | 5728 | 47 | 11627 |

## Skipped

- City kl: hold-out validation skipped, 12 `tagged_unlit` segments, threshold 200.
- City seattle: hold-out validation skipped, 47 `tagged_unlit` segments, threshold 200.
- City berlin, vehicle roads: metrics skipped, 72 `tagged_unlit` segments, threshold 100.
- City london, vehicle roads: metrics skipped, 20 `tagged_unlit` segments, threshold 100.
- City manchester, vehicle roads: metrics skipped, 27 `tagged_unlit` segments, threshold 100.

## Hold-one-out metrics

AUC and precision are computed on tagged segments only: `tagged_lit` segments are the positives and `tagged_unlit` segments are the only negatives. `untagged` segments are left out of both metrics.

Untagged segments are unknown, not unlit. A missing `lit` tag says nothing about whether a street is lit.

Fitted probabilities are biased low, because untagged segments that are in fact lit still pull the model toward 0. No prior correction is applied. The output is a relative likelihood that is useful for ranking, so AUC is the main figure. Precision at the 0.5 cutoff is "undefined" when nothing crosses the cutoff.

### berlin: walking paths

| Metric | Model | Rule baseline | Highway-rate baseline | Highway-footway-rate baseline |
|---|---|---|---|---|
| AUC | 0.776 | 0.500 | 0.505 | 0.828 |
| Precision at 0.5 | 0.901 | undefined | 0.858 | 0.858 |

### london: walking paths

| Metric | Model | Rule baseline | Highway-rate baseline | Highway-footway-rate baseline |
|---|---|---|---|---|
| AUC | 0.652 | 0.500 | 0.556 | 0.627 |
| Precision at 0.5 | 0.926 | undefined | 0.925 | 0.925 |

### manchester: walking paths

| Metric | Model | Rule baseline | Highway-rate baseline | Highway-footway-rate baseline |
|---|---|---|---|---|
| AUC | 0.744 | 0.500 | 0.534 | 0.845 |
| Precision at 0.5 | 0.973 | undefined | 0.964 | 0.964 |

## Baseline comparison

- The model did not beat the highway-footway-rate baseline for berlin, walking paths: model AUC 0.776, highway-footway-rate baseline AUC 0.828.
- The model did not beat the highway-footway-rate baseline for manchester, walking paths: model AUC 0.744, highway-footway-rate baseline AUC 0.845.

## Highway types not seen in training

- berlin: 0
- london: 0
- manchester: 0

## Pairs with no tagged training data

Pairs of highway type and footway kind with no tagged training data, per city:

- berlin: 0 used the highway-type rate, 0 used the overall lit rate
- london: 1 used the highway-type rate, 0 used the overall lit rate
- manchester: 2 used the highway-type rate, 0 used the overall lit rate

## Ground truth

Not run: no ground-truth file was provided.
