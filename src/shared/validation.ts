import { z } from "zod";

export const selectionRectSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive()
});

export const pagesJsonSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["web", "app"]).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1)
  }),
  documents: z.array(
    z.object({
      type: z.enum([
        "chat-history",
        "prd",
        "feature-plan",
        "technical-plan",
        "style-guide",
        "animation-list",
        "page-plan",
        "feature-list"
      ]),
      title: z.string().min(1),
      path: z.string().min(1),
      updatedAt: z.string().min(1)
    })
  ),
  pages: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      route: z.string().min(1),
      description: z.string(),
      uiPrompt: z.string(),
      imagePath: z.string().optional(),
      backgroundImagePath: z.string().optional(),
      needUpdate: z.boolean().optional(),
      assetIds: z.array(z.string())
    })
  ),
  assets: z.array(
    z.object({
      id: z.string().min(1),
      pageId: z.string().min(1),
      type: z.literal("slice"),
      name: z.string().min(1),
      path: z.string().min(1),
      sourceImagePath: z.string().min(1),
      selection: selectionRectSchema,
      selectionId: z.string().min(1).optional(),
      prompt: z.string(),
      createdAt: z.string().min(1)
    })
  ),
  sliceSelections: z
    .array(
      z.object({
        id: z.string().min(1),
        pageId: z.string().min(1),
        name: z.string().min(1),
        sourceImagePath: z.string().min(1),
        selection: selectionRectSchema,
        prompt: z.string(),
        status: z.enum(["pending", "generated", "failed"]),
        assetId: z.string().min(1).nullable().optional(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1)
      })
    )
    .optional()
});

export const planningOutputSchema = z.object({
  conversationMarkdown: z.string().min(1),
  documents: z.object({
    prd: z.string().min(1),
    featurePlan: z.string().min(1),
    technicalPlan: z.string().min(1),
    styleGuide: z.string().min(1),
    animationList: z.string().min(1).optional(),
    pagePlan: z.string().min(1),
    featureList: z.string().min(1)
  }),
  pages: z
    .array(
      z.object({
        name: z.string().min(1),
        route: z.string().min(1),
        description: z.string().min(1),
        uiPrompt: z.string().min(1)
      })
    )
    .min(1)
});

export const documentRevisionOutputSchema = z.object({
  content: z.string().min(1),
  summary: z.string().min(1)
});

export const pagePlanSyncOutputSchema = z.object({
  pages: z
    .array(
      z.object({
        name: z.string().min(1),
        route: z.string().min(1),
        description: z.string().min(1),
        uiPrompt: z.string().min(1)
      })
    )
    .min(1),
  summary: z.string().min(1)
});
