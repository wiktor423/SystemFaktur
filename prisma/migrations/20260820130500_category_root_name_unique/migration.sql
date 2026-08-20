-- Kategorie główne mają parentId = NULL, a w PostgreSQL wartości NULL nie
-- kolidują ze sobą w indeksie unikalnym — `@@unique([parentId, name])`
-- nie chroni więc korzenia drzewa. Indeks częściowy domyka tę lukę.
CREATE UNIQUE INDEX "categories_root_name_key"
  ON "categories" ("name")
  WHERE "parentId" IS NULL;
