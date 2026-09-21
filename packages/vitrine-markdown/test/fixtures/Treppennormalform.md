---
tags:
  - 01141_mathematische_grundlagen
  - matrix
---

Jede [[Matrix]] kann durch [[Elementare Zeilenumformungen]] in die Treppennormalform überführt werden.

$$
\begin{pmatrix}
\underline{1} & 2 & 0 & 0 & 3 & 0 \\
0 & 0 & \underline{1} & 0 & 0 & 0 \\
0 & 0 & 0 & \underline{1} & -2 & 0 \\
0 & 0 & 0 & 0 & 0 & \underline{1} \\
0 & 0 & 0 & 0 & 0 & 0
\end{pmatrix} = A_1 \in M_{56}(\mathbb{R})
$$
Das erste Element jeder Zeile in der Treppennormalform, das nicht 0 ist, wird **Pivot-Element** genannt. In der obigen Matrix $A_1$ sind die Pivotelemente unterstrichen, es handelt sich also um die Elemente $(1,1)$, $(2,3)$, $(3,4)$ und $(4,6)$.

Der [[Rang]] der obigen Matrix $A_1$ ist $Rg(A_1)= 4$.

Alle zeilenäquivalenten Matrizen (Matrizen, die durch Zeilenumformungen ineinander umgeformt werden können) haben die gleiche Treppennormalform. Damit ist die Treppennormalform einer Matrix auch immer eindeutig.