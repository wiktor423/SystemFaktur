import { prisma } from "@/lib/db";
import { categorySchema } from "@/lib/validation/schemas";
import { categoryWithDescendants } from "@/lib/data/queries";
import { toCategory } from "@/server/mappers";
import { fail, handle, ok, parseBody } from "@/server/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const parsed = await parseBody(request, categorySchema);
    if (parsed.error) return parsed.error;

    // Kategoria nie może stać się własnym przodkiem - to rozspójniłoby drzewo
    // i zapętliło każde przejście po nim.
    if (parsed.data.parentId) {
      const categories = (await prisma.category.findMany()).map(toCategory);
      if (categoryWithDescendants(categories, id).includes(parsed.data.parentId)) {
        return fail("Kategoria nie może zostać przeniesiona do własnej podkategorii.", 409, {
          parentId: "Nieprawidłowa kategoria nadrzędna.",
        });
      }
    }

    return ok(toCategory(await prisma.category.update({ where: { id }, data: parsed.data })));
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;

    // Usunięcie kategorii nie może kasować dokumentów. Poddrzewo znika,
    // dokumenty tracą przypisanie, reguły kontrahentów się zerują.
    const categories = (await prisma.category.findMany()).map(toCategory);
    const subtree = categoryWithDescendants(categories, id);

    const result = await prisma.$transaction(async (tx) => {
      const detached = await tx.document.updateMany({
        where: { categoryId: { in: subtree } },
        data: { categoryId: null, categoryAutoAssigned: false },
      });
      await tx.counterparty.updateMany({
        where: { defaultCategoryId: { in: subtree } },
        data: { defaultCategoryId: null },
      });
      // Od liści w górę - relacja rodzica jest ograniczeniem RESTRICT.
      for (const categoryId of [...subtree].reverse()) {
        await tx.category.delete({ where: { id: categoryId } });
      }
      return detached.count;
    });

    return ok({
      deleted: subtree.length,
      detachedDocuments: result,
      message: `Usunięto kategorii: ${subtree.length}. Dokumenty bez przypisania: ${result}.`,
    });
  });
}
