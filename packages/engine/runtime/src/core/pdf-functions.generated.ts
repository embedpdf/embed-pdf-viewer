/* Auto-generated - do not edit by hand. */
import type { Ptr } from './pdf-runtime-module';

export interface PdfFunctions {
  EPDF_CheckPasswordPermissions: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  EPDF_DigestBuffer: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: Ptr) => boolean;
  EPDF_FreeBuffer: (arg0: Ptr) => void;
  EPDF_GetDecodedImageBytes: () => number;
  EPDF_GetMetaKeyCount: (arg0: Ptr, arg1: boolean) => number;
  EPDF_GetMetaKeyName: (arg0: Ptr, arg1: number, arg2: boolean, arg3: Ptr, arg4: number) => number;
  EPDF_GetMetaTrapped: (arg0: Ptr) => number;
  EPDF_GetPageBoxByIndex: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDF_GetPageRotateByIndex: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDF_GetPageTabOrderByIndex: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDF_GetPageUserUnitByIndex: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDF_HasMetaText: (arg0: Ptr, arg1: string) => boolean;
  EPDF_InitThread: () => void;
  EPDF_IsEncrypted: (arg0: Ptr) => boolean;
  EPDF_IsOwnerUnlocked: (arg0: Ptr) => boolean;
  EPDF_LoadBaseDocument: (arg0: Ptr, arg1: string) => Ptr;
  EPDF_LoadMemBaseDocument: (arg0: Ptr, arg1: number, arg2: string) => Ptr;
  EPDF_LoadMemBaseDocument64: (arg0: Ptr, arg1: number, arg2: string) => Ptr;
  EPDF_LoadPageNormalized: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDF_PNG_EncodeRGBA: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: Ptr) => number;
  EPDF_ReleaseBaseDocument: (arg0: Ptr) => void;
  EPDF_RemoveEncryption: (arg0: Ptr) => boolean;
  EPDF_RenderAnnotBitmap: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: string, arg5: Ptr, arg6: number) => boolean;
  EPDF_RenderAnnotBitmapUnrotated: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: string, arg5: number, arg6: Ptr, arg7: Ptr, arg8: number) => boolean;
  EPDF_RenderPage_Continue: (arg0: Ptr, arg1: number) => number;
  EPDF_RenderPageBitmapWithMatrix_Start: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: number, arg5: number) => number;
  EPDF_SaveAsCopyEx: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  EPDF_SaveDocumentToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDF_SaveDocumentToOwnedBufferEx: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: Ptr) => Ptr;
  EPDF_SaveDocumentToOwnedBufferWithVersion: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => Ptr;
  EPDF_SetBaseDocumentSha256: (arg0: Ptr, arg1: Ptr) => void;
  EPDF_SetDecodedImageBudget: (arg0: number) => void;
  EPDF_SetEncryption: (arg0: Ptr, arg1: string, arg2: string, arg3: number) => boolean;
  EPDF_SetMetaText: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDF_SetMetaTrapped: (arg0: Ptr, arg1: number) => boolean;
  EPDF_SetRuntimeOwnerPermissions: (arg0: Ptr, arg1: boolean) => boolean;
  EPDF_ShutdownThread: () => void;
  EPDF_UnlockOwnerPermissions: (arg0: Ptr, arg1: string) => boolean;
  EPDFAction_CloseModel: (arg0: Ptr) => void;
  EPDFAction_CreateGoTo: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFAction_CreateGoToNamed: (arg0: Ptr, arg1: string) => Ptr;
  EPDFAction_CreateHide: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: boolean) => Ptr;
  EPDFAction_CreateJavaScript: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFAction_CreateLaunch: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFAction_CreateNamed: (arg0: Ptr, arg1: string) => Ptr;
  EPDFAction_CreateRemoteGoToByName: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFAction_CreateRemoteGoToDest: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFAction_CreateResetForm: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: boolean) => Ptr;
  EPDFAction_CreateSubmitForm: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: number) => Ptr;
  EPDFAction_CreateURI: (arg0: Ptr, arg1: string) => Ptr;
  EPDFAction_GetNextAt: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFAction_GetNextCount: (arg0: Ptr, arg1: number) => number;
  EPDFAction_GetNodeCount: (arg0: Ptr) => number;
  EPDFAction_GetNodeDest: (arg0: Ptr, arg1: Ptr, arg2: number) => Ptr;
  EPDFAction_GetNodeFilePath: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeHideFlag: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAction_GetNodeJavaScript: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeResetForm: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFAction_GetNodeSubmitForm: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFAction_GetNodeSubmitFormCharSet: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeSubmitFormURL: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeSubtype: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAction_GetNodeTargetCount: (arg0: Ptr, arg1: number) => number;
  EPDFAction_GetNodeTargetName: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFAction_GetNodeTargetObjectNumber: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDFAction_GetNodeType: (arg0: Ptr, arg1: number) => number;
  EPDFAction_GetNodeURI: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFAction_GetNodeURIIsMap: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAction_GetRootNode: (arg0: Ptr) => number;
  EPDFAction_GetWarningFlags: (arg0: Ptr) => number;
  EPDFAction_IsComplete: (arg0: Ptr) => boolean;
  EPDFAction_LoadModel: (arg0: Ptr) => Ptr;
  EPDFAction_NodeHasJavaScript: (arg0: Ptr, arg1: number) => boolean;
  EPDFAction_SetNext: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => boolean;
  EPDFAnnot_AddMeasure: (arg0: Ptr) => Ptr;
  EPDFAnnot_ClearBorderEffect: (arg0: Ptr) => boolean;
  EPDFAnnot_ClearColor: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_ClearEmbedMetadata: (arg0: Ptr) => boolean;
  EPDFAnnot_ClearEmbedMetadataKey: (arg0: Ptr, arg1: string) => boolean;
  EPDFAnnot_ClearMKColor: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_ClearMKIcon: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_ClearRectangleDifferences: (arg0: Ptr) => boolean;
  EPDFAnnot_ExportAppearance: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDFAnnot_GenerateAppearance: (arg0: Ptr) => boolean;
  EPDFAnnot_GenerateAppearanceWithBlend: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_GenerateFormFieldAP: (arg0: Ptr) => boolean;
  EPDFAnnot_GetActionModel: (arg0: Ptr, arg1: number) => Ptr;
  EPDFAnnot_GetAPMatrix: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAnnot_GetAppearanceState: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetAppearanceStateCount: (arg0: Ptr, arg1: number) => number;
  EPDFAnnot_GetAppearanceStateName: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFAnnot_GetAppearanceTransform: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFAnnot_GetAvailableAppearanceModes: (arg0: Ptr) => number;
  EPDFAnnot_GetBlendMode: (arg0: Ptr) => number;
  EPDFAnnot_GetBooleanValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_GetBorderDashPattern: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAnnot_GetBorderDashPatternCount: (arg0: Ptr) => number;
  EPDFAnnot_GetBorderEffect: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_GetBorderStyle: (arg0: Ptr, arg1: Ptr) => number;
  EPDFAnnot_GetCalloutLine: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetCalloutLineCount: (arg0: Ptr) => number;
  EPDFAnnot_GetColor: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFAnnot_GetDefaultAppearance: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  EPDFAnnot_GetDefaultAppearanceFontFace: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: Ptr) => number;
  EPDFAnnot_GetDefaultAppearanceFontPostScriptName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetDrawing: (arg0: Ptr) => number;
  EPDFAnnot_GetDrawingRect: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAnnot_GetEmbedMetadataBoolean: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_GetEmbedMetadataJSON: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetEmbedMetadataNumber: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_GetEmbedMetadataRect: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_GetEmbedMetadataString: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  EPDFAnnot_GetFileAttachmentForWrite: (arg0: Ptr) => Ptr;
  EPDFAnnot_GetIntent: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetLineCaption: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFAnnot_GetLineEndings: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFAnnot_GetLineLeader: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFAnnot_GetMeasure: (arg0: Ptr) => Ptr;
  EPDFAnnot_GetMKColor: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFAnnot_GetMKIcon: (arg0: Ptr, arg1: number) => number;
  EPDFAnnot_GetMKRotation: (arg0: Ptr) => number;
  EPDFAnnot_GetMKText: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFAnnot_GetMKTextPosition: (arg0: Ptr) => number;
  EPDFAnnot_GetName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetObjectNumber: (arg0: Ptr) => number;
  EPDFAnnot_GetOpacity: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_GetOverlayText: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetOverlayTextRepeat: (arg0: Ptr) => boolean;
  EPDFAnnot_GetRect: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_GetRectangleDifferences: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFAnnot_GetReplyType: (arg0: Ptr) => number;
  EPDFAnnot_GetRichContent: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetRichTextJSON: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetRotate: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_GetShapeCaption: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFAnnot_GetStructurePosition: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAnnot_GetTextAlignment: (arg0: Ptr) => number;
  EPDFAnnot_HasAppearanceStream: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_HasEmbedMetadata: (arg0: Ptr) => boolean;
  EPDFAnnot_HasMKIcon: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_IsValid: (arg0: Ptr) => boolean;
  EPDFAnnot_RemoveAction: (arg0: Ptr) => boolean;
  EPDFAnnot_RemoveDest: (arg0: Ptr) => boolean;
  EPDFAnnot_RemoveKey: (arg0: Ptr, arg1: string) => boolean;
  EPDFAnnot_RemoveMeasure: (arg0: Ptr) => boolean;
  EPDFAnnot_SetAction: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_SetAPMatrix: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAnnot_SetAppearanceFromPage: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAnnot_SetBooleanValue: (arg0: Ptr, arg1: string, arg2: boolean) => boolean;
  EPDFAnnot_SetBorderDashPattern: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAnnot_SetBorderEffect: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetBorderStyle: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFAnnot_SetCalloutLine: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAnnot_SetColor: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => boolean;
  EPDFAnnot_SetDefaultAppearance: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number) => boolean;
  EPDFAnnot_SetDefaultAppearanceDocumentFont: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number) => boolean;
  EPDFAnnot_SetDefaultAppearanceRegisteredFont: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number) => boolean;
  EPDFAnnot_SetDrawing: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFAnnot_SetEmbedMetadataBoolean: (arg0: Ptr, arg1: string, arg2: boolean) => boolean;
  EPDFAnnot_SetEmbedMetadataJSON: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_SetEmbedMetadataNumber: (arg0: Ptr, arg1: string, arg2: number) => boolean;
  EPDFAnnot_SetEmbedMetadataRect: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_SetEmbedMetadataString: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_SetEventAction: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAnnot_SetIntent: (arg0: Ptr, arg1: string) => boolean;
  EPDFAnnot_SetLine: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFAnnot_SetLineCaption: (arg0: Ptr, arg1: boolean, arg2: number, arg3: Ptr) => boolean;
  EPDFAnnot_SetLineEndings: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFAnnot_SetLineLeader: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => boolean;
  EPDFAnnot_SetLinkedAnnot: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAnnot_SetMKColor: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => boolean;
  EPDFAnnot_SetMKIcon: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFAnnot_SetMKRotation: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetMKText: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFAnnot_SetMKTextPosition: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetName: (arg0: Ptr, arg1: string) => boolean;
  EPDFAnnot_SetNoColor: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetNumberValue: (arg0: Ptr, arg1: string, arg2: number) => boolean;
  EPDFAnnot_SetOpacity: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetOverlayText: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_SetOverlayTextRepeat: (arg0: Ptr, arg1: boolean) => boolean;
  EPDFAnnot_SetRect: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_SetReplyType: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetRichTextJSON: (arg0: Ptr, arg1: string) => boolean;
  EPDFAnnot_SetRichTextXHTML: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAnnot_SetRotate: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetShapeCaption: (arg0: Ptr, arg1: boolean, arg2: Ptr) => boolean;
  EPDFAnnot_SetStampOpacity: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFAnnot_SetSubtype: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetTextAlignment: (arg0: Ptr, arg1: number) => boolean;
  EPDFAnnot_SetVertices: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAnnot_UpdateAppearanceToRect: (arg0: Ptr, arg1: number) => boolean;
  EPDFAttachment_ExportCanonicalToOwnedBuffer: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFAttachment_ExportRawToOwnedBuffer: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFAttachment_ExtractFile: (arg0: Ptr, arg1: Ptr, arg2: bigint, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFAttachment_ExtractFileToOwnedBuffer: (arg0: Ptr, arg1: bigint, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFAttachment_GetDescription: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFAttachment_GetIntegerValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFAttachment_ImportRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFAttachment_SetDescription: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAttachment_SetName: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFAttachment_SetSubtype: (arg0: Ptr, arg1: string) => boolean;
  EPDFCatalog_GetLanguage: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFCatalog_GetMetadata: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFCatalog_SetMetadata: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFDest_CreateRemoteView: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => Ptr;
  EPDFDest_CreateRemoteXYZ: (arg0: Ptr, arg1: number, arg2: boolean, arg3: number, arg4: boolean, arg5: number, arg6: boolean, arg7: number) => Ptr;
  EPDFDest_CreateView: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => Ptr;
  EPDFDest_CreateViewByObjectNumber: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => Ptr;
  EPDFDest_CreateXYZ: (arg0: Ptr, arg1: boolean, arg2: number, arg3: boolean, arg4: number, arg5: boolean, arg6: number) => Ptr;
  EPDFDest_CreateXYZByObjectNumber: (arg0: Ptr, arg1: number, arg2: boolean, arg3: number, arg4: boolean, arg5: number, arg6: boolean, arg7: number) => Ptr;
  EPDFDest_GetPageObjectNumber: (arg0: Ptr, arg1: Ptr) => number;
  EPDFDest_GetViewNullParams: (arg0: Ptr) => number;
  EPDFDoc_CanonicalDrawing: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_ClearMissingCharacters: (arg0: Ptr) => void;
  EPDFDoc_ClearPagePieceInfoEntry: (arg0: Ptr, arg1: number, arg2: string) => boolean;
  EPDFDoc_ClearPagePieceInfoKey: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr) => boolean;
  EPDFDoc_ClearPieceInfoEntry: (arg0: Ptr, arg1: string) => boolean;
  EPDFDoc_ClearPieceInfoKey: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr) => boolean;
  EPDFDoc_CompareRevisions: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFDoc_CountMissingCharacters: (arg0: Ptr) => number;
  EPDFDoc_DeletePageByObjectNumber: (arg0: Ptr, arg1: number) => boolean;
  EPDFDoc_ExportDictCanonicalToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr) => Ptr;
  EPDFDoc_ExportDictRawToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr) => Ptr;
  EPDFDoc_ExportDrawing: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_ExportPagesFlattened: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => Ptr;
  EPDFDoc_GetAdditionalActionModel: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_GetAttachmentIndexByKey: (arg0: Ptr, arg1: Ptr) => number;
  EPDFDoc_GetAttachmentKey: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetBaseBytesSize: (arg0: Ptr) => bigint;
  EPDFDoc_GetDrawings: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFDoc_GetFontDisplayProgramCoverage: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetFontDisplayProgramData: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetFontEmbeddingPolicy: (arg0: Ptr) => number;
  EPDFDoc_GetFontProgramData: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetFontsFingerprint: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFDoc_GetImportFieldRoots: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetLastModified: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFDoc_GetLoadedBytesSize: (arg0: Ptr) => bigint;
  EPDFDoc_GetLoadedObjectValue: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr, arg5: Ptr) => number;
  EPDFDoc_GetMissingCharacter: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetNamedJavaScriptActionModel: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_GetNamedPageAt: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number, arg5: Ptr, arg6: Ptr) => number;
  EPDFDoc_GetNamedPageCount: (arg0: Ptr, arg1: number) => number;
  EPDFDoc_GetOpenActionDest: (arg0: Ptr) => Ptr;
  EPDFDoc_GetOpenActionModel: (arg0: Ptr) => Ptr;
  EPDFDoc_GetPageActionModel: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  EPDFDoc_GetPageLabelSectionAt: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr, arg5: Ptr, arg6: Ptr) => number;
  EPDFDoc_GetPageLabelSectionCount: (arg0: Ptr) => number;
  EPDFDoc_GetPageLastModified: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetPageObjectNumberByIndex: (arg0: Ptr, arg1: number) => number;
  EPDFDoc_GetPagePieceInfoBoolean: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr) => boolean;
  EPDFDoc_GetPagePieceInfoEntryAt: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetPagePieceInfoEntryCount: (arg0: Ptr, arg1: number) => number;
  EPDFDoc_GetPagePieceInfoKeyAt: (arg0: Ptr, arg1: number, arg2: string, arg3: number, arg4: Ptr, arg5: number) => number;
  EPDFDoc_GetPagePieceInfoKeyCount: (arg0: Ptr, arg1: number, arg2: string) => number;
  EPDFDoc_GetPagePieceInfoLastModified: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetPagePieceInfoName: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr, arg5: number) => number;
  EPDFDoc_GetPagePieceInfoNumber: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr) => boolean;
  EPDFDoc_GetPagePieceInfoString: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr, arg5: number) => number;
  EPDFDoc_GetPagePieceInfoStringArrayAt: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: number, arg5: Ptr, arg6: number) => number;
  EPDFDoc_GetPagePieceInfoStringArrayCount: (arg0: Ptr, arg1: number, arg2: string, arg3: string) => number;
  EPDFDoc_GetPagePieceInfoValueType: (arg0: Ptr, arg1: number, arg2: string, arg3: string) => number;
  EPDFDoc_GetPieceInfoBoolean: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr) => boolean;
  EPDFDoc_GetPieceInfoEntryAt: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetPieceInfoEntryCount: (arg0: Ptr) => number;
  EPDFDoc_GetPieceInfoKeyAt: (arg0: Ptr, arg1: string, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetPieceInfoKeyCount: (arg0: Ptr, arg1: string) => number;
  EPDFDoc_GetPieceInfoLastModified: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  EPDFDoc_GetPieceInfoName: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetPieceInfoNumber: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr) => boolean;
  EPDFDoc_GetPieceInfoString: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr, arg4: number) => number;
  EPDFDoc_GetPieceInfoStringArrayAt: (arg0: Ptr, arg1: string, arg2: string, arg3: number, arg4: Ptr, arg5: number) => number;
  EPDFDoc_GetPieceInfoStringArrayCount: (arg0: Ptr, arg1: string, arg2: string) => number;
  EPDFDoc_GetPieceInfoValueType: (arg0: Ptr, arg1: string, arg2: string) => number;
  EPDFDoc_GetRevision: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFDoc_GetRevisionCount: (arg0: Ptr) => number;
  EPDFDoc_GetStructureObjectNumbers: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFDoc_GetTypographicFeatures: (arg0: Ptr) => boolean;
  EPDFDoc_HasPagePieceInfoEntry: (arg0: Ptr, arg1: number, arg2: string) => boolean;
  EPDFDoc_HasPieceInfoEntry: (arg0: Ptr, arg1: string) => boolean;
  EPDFDoc_ImportDictRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFDoc_ImportDrawing: (arg0: Ptr, arg1: Ptr) => number;
  EPDFDoc_ImportPages: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: number, arg5: Ptr) => boolean;
  EPDFDoc_LoadPageByObjectNumber: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_LoadPageByObjectNumberNormalized: (arg0: Ptr, arg1: number) => Ptr;
  EPDFDoc_OpenBaseOverlay: (arg0: Ptr, arg1: Ptr, arg2: number) => Ptr;
  EPDFDoc_OpenBaseOverlayFromPath: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFDoc_OpenRevision: (arg0: Ptr, arg1: bigint) => Ptr;
  EPDFDoc_ReadLoadedBytes: (arg0: Ptr, arg1: bigint, arg2: Ptr, arg3: number) => number;
  EPDFDoc_RemoveNamedPage: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFDoc_RemoveNamedPagesForPage: (arg0: Ptr, arg1: number) => number;
  EPDFDoc_ResolveFonts: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: Ptr, arg5: Ptr, arg6: Ptr, arg7: Ptr) => Ptr;
  EPDFDoc_SetFontEmbeddingPolicy: (arg0: Ptr, arg1: number) => boolean;
  EPDFDoc_SetNamedPage: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFDoc_SetPageLabelSections: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: number) => boolean;
  EPDFDoc_SetPagePieceInfoBoolean: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: boolean, arg5: Ptr) => boolean;
  EPDFDoc_SetPagePieceInfoName: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: string, arg5: Ptr) => boolean;
  EPDFDoc_SetPagePieceInfoNumber: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: number, arg5: Ptr) => boolean;
  EPDFDoc_SetPagePieceInfoString: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr, arg5: Ptr) => boolean;
  EPDFDoc_SetPagePieceInfoStringArray: (arg0: Ptr, arg1: number, arg2: string, arg3: string, arg4: Ptr, arg5: number, arg6: Ptr) => boolean;
  EPDFDoc_SetPageRotationByObjectNumber: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFDoc_SetPieceInfoBoolean: (arg0: Ptr, arg1: string, arg2: string, arg3: boolean, arg4: Ptr) => boolean;
  EPDFDoc_SetPieceInfoName: (arg0: Ptr, arg1: string, arg2: string, arg3: string, arg4: Ptr) => boolean;
  EPDFDoc_SetPieceInfoNumber: (arg0: Ptr, arg1: string, arg2: string, arg3: number, arg4: Ptr) => boolean;
  EPDFDoc_SetPieceInfoString: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFDoc_SetPieceInfoStringArray: (arg0: Ptr, arg1: string, arg2: string, arg3: Ptr, arg4: number, arg5: Ptr) => boolean;
  EPDFDoc_SetTypographicFeatures: (arg0: Ptr, arg1: boolean) => boolean;
  EPDFDoc_StartLoadPageByObjectNumber: (arg0: Ptr, arg1: number, arg2: boolean) => Ptr;
  EPDFDocument_ClearEmbedMetadata: (arg0: Ptr) => boolean;
  EPDFDss_Add: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFDss_GetCount: (arg0: Ptr, arg1: number) => number;
  EPDFDss_GetData: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFFont_AddFallbackFont: (arg0: number, arg1: number) => boolean;
  EPDFFont_AuthorizeEditing: (arg0: number) => boolean;
  EPDFFont_ClearFallbackFonts: () => void;
  EPDFFont_ClearRegisteredFonts: () => void;
  EPDFFont_GetCoverage: (arg0: number, arg1: Ptr, arg2: number) => number;
  EPDFFont_GetEmbeddingPermission: (arg0: number) => number;
  EPDFFont_GetFallbackOrder: (arg0: number, arg1: boolean, arg2: Ptr, arg3: number) => number;
  EPDFFont_GetFamilyName: (arg0: number, arg1: Ptr, arg2: number) => number;
  EPDFFont_GetLastResortFont: () => number;
  EPDFFont_GetMetrics: (arg0: number, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFFont_GetPostScriptName: (arg0: number, arg1: Ptr, arg2: number) => number;
  EPDFFont_GetProgramData: (arg0: number, arg1: Ptr, arg2: number) => number;
  EPDFFont_GetProgramFormat: (arg0: number) => number;
  EPDFFont_GetProgramHash: (arg0: number, arg1: Ptr) => boolean;
  EPDFFont_GetWeight: (arg0: number) => number;
  EPDFFont_IsEditingAuthorized: (arg0: number) => boolean;
  EPDFFont_IsInstanced: (arg0: number) => boolean;
  EPDFFont_IsItalic: (arg0: number) => boolean;
  EPDFFont_RegisterFont: (arg0: string, arg1: number, arg2: number, arg3: Ptr) => number;
  EPDFFont_RegisterMemFont: (arg0: string, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFFont_RegisterMemFont64: (arg0: string, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFFont_SetLastResortFont: (arg0: number) => boolean;
  EPDFFontFaces_Close: (arg0: Ptr) => void;
  EPDFFontFaces_Count: (arg0: Ptr) => number;
  EPDFFontFaces_CountPrograms: (arg0: Ptr, arg1: number) => number;
  EPDFFontFaces_GetFamily: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFFontFaces_GetProgramDisplayHash: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDFFontFaces_GetProgramEmbedded: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFFontFaces_GetProgramEmbeddingPermission: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFFontFaces_GetProgramFormat: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFFontFaces_GetProgramHash: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDFFontFaces_GetProgramMetrics: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFFontFaces_GetProgramObjNum: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFFontFaces_GetProgramPostScriptName: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFFontFaces_GetWeight: (arg0: Ptr, arg1: number) => number;
  EPDFFontFaces_IsItalic: (arg0: Ptr, arg1: number) => boolean;
  EPDFFontFaces_Load: (arg0: Ptr) => Ptr;
  EPDFFontFaces_ProgramMapsUnicode: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFFontResolution_Close: (arg0: Ptr) => void;
  EPDFFontResolution_CountMissingCharacters: (arg0: Ptr) => number;
  EPDFFontResolution_GetBaseFontName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFFontResolution_GetFallbacks: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFFontResolution_GetFamily: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFFontResolution_GetMissingCharacter: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFFontResolution_GetProgramDisplayHash: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFFontResolution_GetProgramObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFFontResolution_GetRegisteredFont: (arg0: Ptr, arg1: number) => number;
  EPDFFontResolution_GetSource: (arg0: Ptr, arg1: number) => number;
  EPDFFontResolution_GetWeight: (arg0: Ptr, arg1: number) => number;
  EPDFFontResolution_IsDegraded: (arg0: Ptr, arg1: number) => boolean;
  EPDFFontResolution_IsItalic: (arg0: Ptr, arg1: number) => boolean;
  EPDFForm_AttachWidget: (arg0: Ptr, arg1: number, arg2: number, arg3: string, arg4: number) => boolean;
  EPDFForm_ClearFieldEmbedMetadata: (arg0: Ptr, arg1: number) => boolean;
  EPDFForm_ClearFieldEmbedMetadataKey: (arg0: Ptr, arg1: number, arg2: string) => boolean;
  EPDFForm_CloseModel: (arg0: Ptr) => void;
  EPDFForm_CountCalculationOrder: (arg0: Ptr) => number;
  EPDFForm_CountFieldDefaultValues: (arg0: Ptr, arg1: number) => number;
  EPDFForm_CountFieldOptions: (arg0: Ptr, arg1: number) => number;
  EPDFForm_CountFields: (arg0: Ptr) => number;
  EPDFForm_CountFieldValues: (arg0: Ptr, arg1: number) => number;
  EPDFForm_CountFieldWidgets: (arg0: Ptr, arg1: number) => number;
  EPDFForm_CreateField: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_DeleteField: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  EPDFForm_DetachWidget: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFForm_ExportFDF: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_ExportFieldRawToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDFForm_ExportXFDF: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetCalculationOrderFieldIndex: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldActionModel: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  EPDFForm_GetFieldAlternateName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_GetFieldDefaultValueAt: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldDefaultValueKind: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldEmbedMetadataBoolean: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr) => boolean;
  EPDFForm_GetFieldEmbedMetadataJSON: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_GetFieldEmbedMetadataNumber: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr) => boolean;
  EPDFForm_GetFieldEmbedMetadataString: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldFamily: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldFlags: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldIndexByObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldIndexForWidget: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldMappingName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_GetFieldMaxLen: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_GetFieldObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldOptionLabel: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldOptionValue: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldOrigin: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldPartialName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFForm_GetFieldTopIndex: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldValueAt: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldValueKind: (arg0: Ptr, arg1: number) => number;
  EPDFForm_GetFieldWidgetExportValue: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldWidgetObjNum: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFForm_GetFieldWidgetOnState: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFForm_GetFieldWidgetPageObjNum: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFForm_GetFieldWidgetRect: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDFForm_GetFormKind: (arg0: Ptr) => number;
  EPDFForm_GetNeedAppearances: (arg0: Ptr) => boolean;
  EPDFForm_HasFieldEmbedMetadata: (arg0: Ptr, arg1: number) => boolean;
  EPDFForm_ImportFieldRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFForm_IsFieldOptionSelected: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFForm_IsFieldWidgetChecked: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFForm_LoadModel: (arg0: Ptr) => Ptr;
  EPDFForm_RedrawFieldWidgets: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  EPDFForm_Repair: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFForm_SetCalculationOrder: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFForm_SetFieldAlternateName: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFForm_SetFieldAppearanceText: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: number, arg5: Ptr) => boolean;
  EPDFForm_SetFieldDefaultValue: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => boolean;
  EPDFForm_SetFieldDisplay: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number, arg5: Ptr) => boolean;
  EPDFForm_SetFieldEmbedMetadataBoolean: (arg0: Ptr, arg1: number, arg2: string, arg3: boolean) => boolean;
  EPDFForm_SetFieldEmbedMetadataJSON: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFForm_SetFieldEmbedMetadataNumber: (arg0: Ptr, arg1: number, arg2: string, arg3: number) => boolean;
  EPDFForm_SetFieldEmbedMetadataString: (arg0: Ptr, arg1: number, arg2: string, arg3: Ptr) => boolean;
  EPDFForm_SetFieldEventAction: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  EPDFForm_SetFieldFlags: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => boolean;
  EPDFForm_SetFieldMappingName: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFForm_SetFieldMaxLen: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFForm_SetFieldName: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFForm_SetFieldOptions: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: number) => boolean;
  EPDFForm_SetFieldSelectedIndices: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => boolean;
  EPDFForm_SetFieldValue: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => boolean;
  EPDFForm_SetFieldWidgetsChecked: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr, arg5: number, arg6: Ptr) => boolean;
  EPDFImageObj_SetJpeg: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: number) => boolean;
  EPDFImageObj_SetPng: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: number) => boolean;
  EPDFLayer_AbortTransaction: (arg0: Ptr) => boolean;
  EPDFLayer_BeginTransaction: (arg0: Ptr) => boolean;
  EPDFLayer_CommitTransaction: (arg0: Ptr) => boolean;
  EPDFLayer_GetBaseDocument: (arg0: Ptr) => Ptr;
  EPDFLayer_GetBaseSha256: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFLayer_GetBirthName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFLayer_GetBirthObjectNumber: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFLayer_GetLastObjectNumber: (arg0: Ptr) => number;
  EPDFLayer_GetPromotedObjectCount: (arg0: Ptr) => number;
  EPDFLayer_IsInTransaction: (arg0: Ptr) => boolean;
  EPDFLayer_IsObjectPromoted: (arg0: Ptr, arg1: number) => boolean;
  EPDFLayer_IsPagePromoted: (arg0: Ptr, arg1: number) => boolean;
  EPDFLayer_OpenLayer: (arg0: Ptr, arg1: Ptr, arg2: string, arg3: Ptr) => Ptr;
  EPDFLayer_OpenLayerArtifact: (arg0: Ptr, arg1: Ptr, arg2: string, arg3: Ptr) => Ptr;
  EPDFLayer_OpenLayerArtifactFromPath: (arg0: Ptr, arg1: Ptr, arg2: string, arg3: Ptr) => Ptr;
  EPDFLayer_RaiseLastObjectNumber: (arg0: Ptr, arg1: number) => boolean;
  EPDFLayer_SaveDelta: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFLayer_SaveDeltaEx: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFLayer_SaveDeltaToOwnedBuffer: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFLayer_SaveDeltaToOwnedBufferEx: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => Ptr;
  EPDFLayer_SaveLayerArtifact: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  EPDFLayer_SaveLayerArtifactEx: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  EPDFLayer_SaveLayerArtifactToOwnedBuffer: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  EPDFLayer_SaveLayerArtifactToOwnedBufferEx: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => Ptr;
  EPDFMeasure_AddFormat: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => Ptr;
  EPDFMeasure_CountFormats: (arg0: Ptr, arg1: number) => number;
  EPDFMeasure_GetCYX: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFMeasure_GetFormat: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  EPDFMeasure_GetOrigin: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFMeasure_GetRatio: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFMeasure_GetSubtype: (arg0: Ptr) => number;
  EPDFMeasure_RemoveFormats: (arg0: Ptr, arg1: number) => boolean;
  EPDFMeasure_SetCYX: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFMeasure_SetOrigin: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFMeasure_SetRatio: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNamedDest_Remove: (arg0: Ptr, arg1: string) => boolean;
  EPDFNamedDest_SetDest: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  EPDFNumberFormat_GetConversion: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNumberFormat_GetFixedDenominator: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNumberFormat_GetFraction: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNumberFormat_GetLabelPosition: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNumberFormat_GetPrecision: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFNumberFormat_GetText: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFNumberFormat_GetUnit: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFNumberFormat_SetConversion: (arg0: Ptr, arg1: number) => boolean;
  EPDFNumberFormat_SetFixedDenominator: (arg0: Ptr, arg1: boolean) => boolean;
  EPDFNumberFormat_SetFraction: (arg0: Ptr, arg1: number) => boolean;
  EPDFNumberFormat_SetLabelPosition: (arg0: Ptr, arg1: number) => boolean;
  EPDFNumberFormat_SetPrecision: (arg0: Ptr, arg1: number) => boolean;
  EPDFNumberFormat_SetText: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFNumberFormat_SetUnit: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFObjectDiff_Close: (arg0: Ptr) => void;
  EPDFObjectDiff_GetCount: (arg0: Ptr) => number;
  EPDFObjectDiff_GetEntry: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr, arg6: Ptr, arg7: Ptr) => boolean;
  EPDFObjectDiff_GetReadStatus: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFObjectDiff_GetReferrer: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: Ptr, arg5: Ptr, arg6: number) => number;
  EPDFObjectDiff_GetReferrerCount: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFObjectDiff_GetRevisionHealth: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFObjectDiff_GetValue: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number, arg5: Ptr) => number;
  EPDFOutline_CreateItem: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: Ptr) => number;
  EPDFOutline_DeleteItem: (arg0: Ptr, arg1: number) => boolean;
  EPDFOutline_ExportItemRawToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDFOutline_GetItem: (arg0: Ptr, arg1: number) => Ptr;
  EPDFOutline_GetObjectNumber: (arg0: Ptr) => number;
  EPDFOutline_ImportItemRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFOutline_MoveItem: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => boolean;
  EPDFOutline_SetAction: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFOutline_SetColor: (arg0: Ptr, arg1: number, arg2: boolean, arg3: number, arg4: number, arg5: number) => boolean;
  EPDFOutline_SetOpen: (arg0: Ptr, arg1: number, arg2: boolean) => boolean;
  EPDFOutline_SetStyle: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFOutline_SetTitle: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFPage_AddViewport: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFPage_AddViewportRaw: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDFPage_ApplyRedactions: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  EPDFPage_ContinueLoad: (arg0: Ptr, arg1: number) => number;
  EPDFPage_CountViewports: (arg0: Ptr) => number;
  EPDFPage_CountViewportsRaw: (arg0: Ptr, arg1: number) => number;
  EPDFPage_CreateAnnot: (arg0: Ptr, arg1: number) => Ptr;
  EPDFPage_CreateAnnotRaw: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => Ptr;
  EPDFPage_ExportAnnotationsAsDocument: (arg0: Ptr, arg1: Ptr, arg2: number) => Ptr;
  EPDFPage_ExportAnnotsRawToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => Ptr;
  EPDFPage_ExportRawToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr) => Ptr;
  EPDFPage_FindViewport: (arg0: Ptr, arg1: Ptr) => number;
  EPDFPage_Flatten: (arg0: Ptr, arg1: number) => number;
  EPDFPage_FlattenAnnotations: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: Ptr) => number;
  EPDFPage_GetAnnotByName: (arg0: Ptr, arg1: Ptr) => Ptr;
  EPDFPage_GetAnnotByObjectNumber: (arg0: Ptr, arg1: number) => Ptr;
  EPDFPage_GetAnnotCountRaw: (arg0: Ptr, arg1: number) => number;
  EPDFPage_GetAnnotIndexByNameRaw: (arg0: Ptr, arg1: number, arg2: Ptr) => number;
  EPDFPage_GetAnnotIndexByObjectNumberRaw: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFPage_GetAnnotRaw: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  EPDFPage_GetObjectNumber: (arg0: Ptr) => number;
  EPDFPage_GetParsedSize: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFPage_GetViewport: (arg0: Ptr, arg1: number) => Ptr;
  EPDFPage_GetViewportRaw: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  EPDFPage_ImportAnnotsRaw: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => boolean;
  EPDFPage_ImportRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  EPDFPage_InsertBlankRaw: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => boolean;
  EPDFPage_IsContentCurrent: (arg0: Ptr) => boolean;
  EPDFPage_IsValid: (arg0: Ptr) => boolean;
  EPDFPage_MoveAnnots: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  EPDFPage_MoveAnnotsRaw: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: number) => boolean;
  EPDFPage_PromoteInlineAnnotsRaw: (arg0: Ptr, arg1: number) => number;
  EPDFPage_RemoveAnnot: (arg0: Ptr, arg1: number) => boolean;
  EPDFPage_RemoveAnnotByName: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFPage_RemoveAnnotByObjectNumber: (arg0: Ptr, arg1: number) => boolean;
  EPDFPage_RemoveAnnotRaw: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFPage_RemoveViewport: (arg0: Ptr, arg1: number) => boolean;
  EPDFPage_RemoveViewportRaw: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  EPDFPage_ResetRenderCache: (arg0: Ptr) => boolean;
  EPDFSig_CloseModel: (arg0: Ptr) => void;
  EPDFSig_Count: (arg0: Ptr) => number;
  EPDFSig_DigestByteRange: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFSig_DigestFileRange: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: Ptr) => boolean;
  EPDFSig_GetByteRange: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFSig_GetContents: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFSig_GetCoverage: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetDocMDPPermission: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetFieldMDPAction: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetFieldName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFSig_GetFieldNameAt: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: Ptr, arg5: number) => number;
  EPDFSig_GetFieldNameCount: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFSig_GetFieldObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetIndexByFieldObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetKind: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetLockAction: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetLockPermission: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetRevisionIndex: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetSeedValueFilter: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  EPDFSig_GetSeedValueListAt: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: Ptr, arg5: number) => number;
  EPDFSig_GetSeedValueListCount: (arg0: Ptr, arg1: number, arg2: number) => number;
  EPDFSig_GetSeedValueMDP: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetSeedValuePresentFlags: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetSeedValueRequiredFlags: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetSeedValueVersion: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetString: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number) => number;
  EPDFSig_GetValueObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetWidgetObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFSig_GetWidgetPageObjNum: (arg0: Ptr, arg1: number) => number;
  EPDFSig_HasSeedValue: (arg0: Ptr, arg1: number) => boolean;
  EPDFSig_IsCatalogCertification: (arg0: Ptr, arg1: number) => boolean;
  EPDFSig_IsRevisionChainValid: (arg0: Ptr) => boolean;
  EPDFSig_IsSigned: (arg0: Ptr, arg1: number) => boolean;
  EPDFSig_LoadModel: (arg0: Ptr) => Ptr;
  EPDFSig_Prepare: (arg0: Ptr, arg1: number, arg2: Ptr) => number;
  EPDFSig_SaveCandidate: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  EPDFSig_SaveCandidateToOwnedBuffer: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr) => Ptr;
  EPDFSig_Seal: (arg0: Ptr, arg1: bigint, arg2: bigint, arg3: bigint, arg4: number, arg5: Ptr, arg6: Ptr, arg7: Ptr, arg8: Ptr, arg9: Ptr) => boolean;
  EPDFSig_SealSpan: (arg0: Ptr, arg1: bigint, arg2: bigint, arg3: bigint, arg4: Ptr, arg5: Ptr, arg6: Ptr) => boolean;
  EPDFSig_SetFieldLock: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: number, arg5: number) => boolean;
  EPDFSig_WriteContents: (arg0: Ptr, arg1: bigint, arg2: bigint, arg3: bigint, arg4: Ptr, arg5: number) => boolean;
  EPDFText_GetCharGeometry: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  EPDFText_GetCharToTextMap: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFText_GetPageGeometry: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => number;
  EPDFText_GetTextFull: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFText_RedactInQuads: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: boolean, arg4: boolean) => boolean;
  EPDFText_RedactInRect: (arg0: Ptr, arg1: Ptr, arg2: boolean, arg3: boolean) => boolean;
  EPDFViewport_AddMeasure: (arg0: Ptr) => Ptr;
  EPDFViewport_Close: (arg0: Ptr) => void;
  EPDFViewport_GetBBox: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFViewport_GetMeasure: (arg0: Ptr) => Ptr;
  EPDFViewport_GetName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  EPDFViewport_RemoveMeasure: (arg0: Ptr) => boolean;
  EPDFViewport_SetBBox: (arg0: Ptr, arg1: Ptr) => boolean;
  EPDFViewport_SetName: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_CanRedo: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_CanUndo: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_DoDocumentAAction: (arg0: Ptr, arg1: number) => void;
  FORM_DoDocumentJSAction: (arg0: Ptr) => void;
  FORM_DoDocumentOpenAction: (arg0: Ptr) => void;
  FORM_DoPageAAction: (arg0: Ptr, arg1: Ptr, arg2: number) => void;
  FORM_ForceToKillFocus: (arg0: Ptr) => boolean;
  FORM_GetFocusedAnnot: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FORM_GetFocusedText: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FORM_GetSelectedText: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FORM_GetTextDirection: (arg0: Ptr, arg1: Ptr) => number;
  FORM_IsIndexSelected: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FORM_OnAfterLoadPage: (arg0: Ptr, arg1: Ptr) => void;
  FORM_OnBeforeClosePage: (arg0: Ptr, arg1: Ptr) => void;
  FORM_OnChar: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FORM_OnFocus: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnKeyDown: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FORM_OnKeyUp: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FORM_OnLButtonDoubleClick: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnLButtonDown: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnLButtonUp: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnMouseMove: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnMouseWheel: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number, arg5: number) => boolean;
  FORM_OnRButtonDown: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_OnRButtonUp: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FORM_Redo: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_ReplaceAndKeepSelection: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => void;
  FORM_ReplaceSelection: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => void;
  FORM_SelectAllText: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_SetFocusedAnnot: (arg0: Ptr, arg1: Ptr) => boolean;
  FORM_SetIndexSelected: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: boolean) => boolean;
  FORM_SetTextDirection: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FORM_Undo: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_AddInstalledFont: (arg0: Ptr, arg1: Ptr, arg2: number) => void;
  FPDF_CloseDocument: (arg0: Ptr) => void;
  FPDF_ClosePage: (arg0: Ptr) => void;
  FPDF_CloseXObject: (arg0: Ptr) => void;
  FPDF_CopyViewerPreferences: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_CountNamedDests: (arg0: Ptr) => number;
  FPDF_CreateClipPath: (arg0: number, arg1: number, arg2: number, arg3: number) => Ptr;
  FPDF_CreateNewDocument: () => Ptr;
  FPDF_DestroyClipPath: (arg0: Ptr) => void;
  FPDF_DestroyLibrary: () => void;
  FPDF_DeviceToPage: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: Ptr, arg9: Ptr) => boolean;
  FPDF_DocumentHasValidCrossReferenceTable: (arg0: Ptr) => boolean;
  FPDF_FFLDraw: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: number) => void;
  FPDF_FreeDefaultSystemFontInfo: (arg0: Ptr) => void;
  FPDF_GetDefaultSystemFontInfo: () => Ptr;
  FPDF_GetDefaultTTFMap: () => Ptr;
  FPDF_GetDefaultTTFMapCount: () => number;
  FPDF_GetDefaultTTFMapEntry: (arg0: number) => Ptr;
  FPDF_GetDocPermissions: (arg0: Ptr) => number;
  FPDF_GetDocUserPermissions: (arg0: Ptr) => number;
  FPDF_GetFileIdentifier: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDF_GetFileVersion: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_GetFormType: (arg0: Ptr) => number;
  FPDF_GetLastError: () => number;
  FPDF_GetMetaText: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  FPDF_GetNamedDest: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => Ptr;
  FPDF_GetNamedDestByName: (arg0: Ptr, arg1: string) => Ptr;
  FPDF_GetPageAAction: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_GetPageBoundingBox: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_GetPageCount: (arg0: Ptr) => number;
  FPDF_GetPageHeight: (arg0: Ptr) => number;
  FPDF_GetPageHeightF: (arg0: Ptr) => number;
  FPDF_GetPageLabel: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDF_GetPageSizeByIndex: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => number;
  FPDF_GetPageSizeByIndexF: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDF_GetPageWidth: (arg0: Ptr) => number;
  FPDF_GetPageWidthF: (arg0: Ptr) => number;
  FPDF_GetSecurityHandlerRevision: (arg0: Ptr) => number;
  FPDF_GetSignatureCount: (arg0: Ptr) => number;
  FPDF_GetSignatureObject: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_GetTrailerEnds: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_GetXFAPacketContent: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDF_GetXFAPacketCount: (arg0: Ptr) => number;
  FPDF_GetXFAPacketName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDF_ImportNPagesToOne: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => Ptr;
  FPDF_ImportPages: (arg0: Ptr, arg1: Ptr, arg2: string, arg3: number) => boolean;
  FPDF_ImportPagesByIndex: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: number) => boolean;
  FPDF_InitLibrary: () => void;
  FPDF_InitLibraryWithConfig: (arg0: Ptr) => void;
  FPDF_LoadCustomDocument: (arg0: Ptr, arg1: string) => Ptr;
  FPDF_LoadDocument: (arg0: Ptr, arg1: string) => Ptr;
  FPDF_LoadMemDocument: (arg0: Ptr, arg1: number, arg2: string) => Ptr;
  FPDF_LoadMemDocument64: (arg0: Ptr, arg1: number, arg2: string) => Ptr;
  FPDF_LoadPage: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_LoadXFA: (arg0: Ptr) => boolean;
  FPDF_MovePages: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FPDF_NewFormObjectFromXObject: (arg0: Ptr) => Ptr;
  FPDF_NewXObjectFromPage: (arg0: Ptr, arg1: Ptr, arg2: number) => Ptr;
  FPDF_PageToDevice: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: Ptr, arg9: Ptr) => boolean;
  FPDF_RemoveFormFieldHighlight: (arg0: Ptr) => void;
  FPDF_RenderPage_Close: (arg0: Ptr) => void;
  FPDF_RenderPage_Continue: (arg0: Ptr, arg1: Ptr) => number;
  FPDF_RenderPageBitmap: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number) => void;
  FPDF_RenderPageBitmap_Start: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: Ptr) => number;
  FPDF_RenderPageBitmapWithColorScheme_Start: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number, arg7: number, arg8: Ptr, arg9: Ptr) => number;
  FPDF_RenderPageBitmapWithMatrix: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: number) => void;
  FPDF_SaveAsCopy: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDF_SaveWithVersion: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FPDF_SetFormFieldHighlightAlpha: (arg0: Ptr, arg1: number) => void;
  FPDF_SetFormFieldHighlightColor: (arg0: Ptr, arg1: number, arg2: number) => void;
  FPDF_SetSandBoxPolicy: (arg0: number, arg1: boolean) => void;
  FPDF_SetSystemFontInfo: (arg0: Ptr) => void;
  FPDF_StructElement_Attr_CountChildren: (arg0: Ptr) => number;
  FPDF_StructElement_Attr_GetBlobValue: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  FPDF_StructElement_Attr_GetBooleanValue: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_StructElement_Attr_GetChildAtIndex: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_StructElement_Attr_GetCount: (arg0: Ptr) => number;
  FPDF_StructElement_Attr_GetName: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDF_StructElement_Attr_GetNumberValue: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDF_StructElement_Attr_GetStringValue: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  FPDF_StructElement_Attr_GetType: (arg0: Ptr) => number;
  FPDF_StructElement_Attr_GetValue: (arg0: Ptr, arg1: string) => Ptr;
  FPDF_StructElement_CountChildren: (arg0: Ptr) => number;
  FPDF_StructElement_GetActualText: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetAltText: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetAttributeAtIndex: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_StructElement_GetAttributeCount: (arg0: Ptr) => number;
  FPDF_StructElement_GetChildAtIndex: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_StructElement_GetChildMarkedContentID: (arg0: Ptr, arg1: number) => number;
  FPDF_StructElement_GetExpansion: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetID: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetLang: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetMarkedContentID: (arg0: Ptr) => number;
  FPDF_StructElement_GetMarkedContentIdAtIndex: (arg0: Ptr, arg1: number) => number;
  FPDF_StructElement_GetMarkedContentIdCount: (arg0: Ptr) => number;
  FPDF_StructElement_GetObjType: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetParent: (arg0: Ptr) => Ptr;
  FPDF_StructElement_GetRawType: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetStringAttribute: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  FPDF_StructElement_GetTitle: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructElement_GetType: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDF_StructTree_Close: (arg0: Ptr) => void;
  FPDF_StructTree_CountChildren: (arg0: Ptr) => number;
  FPDF_StructTree_GetChildAtIndex: (arg0: Ptr, arg1: number) => Ptr;
  FPDF_StructTree_GetForPage: (arg0: Ptr) => Ptr;
  FPDF_VIEWERREF_GetDuplex: (arg0: Ptr) => number;
  FPDF_VIEWERREF_GetName: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  FPDF_VIEWERREF_GetNumCopies: (arg0: Ptr) => number;
  FPDF_VIEWERREF_GetPrintPageRange: (arg0: Ptr) => Ptr;
  FPDF_VIEWERREF_GetPrintPageRangeCount: (arg0: Ptr) => number;
  FPDF_VIEWERREF_GetPrintPageRangeElement: (arg0: Ptr, arg1: number) => number;
  FPDF_VIEWERREF_GetPrintScaling: (arg0: Ptr) => boolean;
  FPDFAction_GetDest: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFAction_GetFilePath: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAction_GetType: (arg0: Ptr) => number;
  FPDFAction_GetURIPath: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_AddFileAttachment: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFAnnot_AddInkStroke: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAnnot_AppendAttachmentPoints: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_AppendObject: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_CountAttachmentPoints: (arg0: Ptr) => number;
  FPDFAnnot_GetAP: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetAttachmentPoints: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFAnnot_GetBorder: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFAnnot_GetColor: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  FPDFAnnot_GetFileAttachment: (arg0: Ptr) => Ptr;
  FPDFAnnot_GetFlags: (arg0: Ptr) => number;
  FPDFAnnot_GetFocusableSubtypes: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFAnnot_GetFocusableSubtypesCount: (arg0: Ptr) => number;
  FPDFAnnot_GetFontColor: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFAnnot_GetFontSize: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFAnnot_GetFormAdditionalActionJavaScript: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  FPDFAnnot_GetFormControlCount: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAnnot_GetFormControlIndex: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAnnot_GetFormFieldAlternateName: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetFormFieldAtPoint: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  FPDFAnnot_GetFormFieldExportValue: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetFormFieldFlags: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAnnot_GetFormFieldName: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetFormFieldType: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAnnot_GetFormFieldValue: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetInkListCount: (arg0: Ptr) => number;
  FPDFAnnot_GetInkListPath: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetLine: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFAnnot_GetLink: (arg0: Ptr) => Ptr;
  FPDFAnnot_GetLinkedAnnot: (arg0: Ptr, arg1: string) => Ptr;
  FPDFAnnot_GetNumberValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  FPDFAnnot_GetObject: (arg0: Ptr, arg1: number) => Ptr;
  FPDFAnnot_GetObjectCount: (arg0: Ptr) => number;
  FPDFAnnot_GetOptionCount: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAnnot_GetOptionLabel: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr, arg4: number) => number;
  FPDFAnnot_GetRect: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_GetStringValue: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  FPDFAnnot_GetSubtype: (arg0: Ptr) => number;
  FPDFAnnot_GetValueType: (arg0: Ptr, arg1: string) => number;
  FPDFAnnot_GetVertices: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAnnot_HasAttachmentPoints: (arg0: Ptr) => boolean;
  FPDFAnnot_HasKey: (arg0: Ptr, arg1: string) => boolean;
  FPDFAnnot_IsChecked: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_IsObjectSupportedSubtype: (arg0: number) => boolean;
  FPDFAnnot_IsOptionSelected: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFAnnot_IsSupportedSubtype: (arg0: number) => boolean;
  FPDFAnnot_RemoveInkList: (arg0: Ptr) => boolean;
  FPDFAnnot_RemoveObject: (arg0: Ptr, arg1: number) => boolean;
  FPDFAnnot_SetAP: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFAnnot_SetAttachmentPoints: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFAnnot_SetBorder: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => boolean;
  FPDFAnnot_SetColor: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number) => boolean;
  FPDFAnnot_SetFlags: (arg0: Ptr, arg1: number) => boolean;
  FPDFAnnot_SetFocusableSubtypes: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFAnnot_SetFontColor: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: number) => boolean;
  FPDFAnnot_SetFormFieldFlags: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFAnnot_SetRect: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_SetStringValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  FPDFAnnot_SetURI: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAnnot_UpdateObject: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAttachment_GetAFRelationship: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAttachment_GetDescription: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAttachment_GetFile: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  FPDFAttachment_GetName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAttachment_GetStringValue: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number) => number;
  FPDFAttachment_GetSubtype: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFAttachment_GetValueType: (arg0: Ptr, arg1: string) => number;
  FPDFAttachment_HasKey: (arg0: Ptr, arg1: string) => boolean;
  FPDFAttachment_SetDescription: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFAttachment_SetFile: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => boolean;
  FPDFAttachment_SetStringValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  FPDFAvail_Create: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFAvail_Destroy: (arg0: Ptr) => void;
  FPDFAvail_GetDocument: (arg0: Ptr, arg1: string) => Ptr;
  FPDFAvail_GetFirstPageNum: (arg0: Ptr) => number;
  FPDFAvail_IsDocAvail: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAvail_IsFormAvail: (arg0: Ptr, arg1: Ptr) => number;
  FPDFAvail_IsLinearized: (arg0: Ptr) => number;
  FPDFAvail_IsPageAvail: (arg0: Ptr, arg1: number, arg2: Ptr) => number;
  FPDFBitmap_Create: (arg0: number, arg1: number, arg2: number) => Ptr;
  FPDFBitmap_CreateEx: (arg0: number, arg1: number, arg2: number, arg3: Ptr, arg4: number) => Ptr;
  FPDFBitmap_Destroy: (arg0: Ptr) => void;
  FPDFBitmap_FillRect: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number) => boolean;
  FPDFBitmap_GetBuffer: (arg0: Ptr) => Ptr;
  FPDFBitmap_GetFormat: (arg0: Ptr) => number;
  FPDFBitmap_GetHeight: (arg0: Ptr) => number;
  FPDFBitmap_GetStride: (arg0: Ptr) => number;
  FPDFBitmap_GetWidth: (arg0: Ptr) => number;
  FPDFBookmark_Find: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFBookmark_GetAction: (arg0: Ptr) => Ptr;
  FPDFBookmark_GetColor: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFBookmark_GetCount: (arg0: Ptr) => number;
  FPDFBookmark_GetDest: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFBookmark_GetFirstChild: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFBookmark_GetNextSibling: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFBookmark_GetStyle: (arg0: Ptr) => number;
  FPDFBookmark_GetTitle: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFCatalog_GetLanguage: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFCatalog_IsTagged: (arg0: Ptr) => boolean;
  FPDFCatalog_SetLanguage: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFClipPath_CountPaths: (arg0: Ptr) => number;
  FPDFClipPath_CountPathSegments: (arg0: Ptr, arg1: number) => number;
  FPDFClipPath_GetPathSegment: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  FPDFDest_GetDestPageIndex: (arg0: Ptr, arg1: Ptr) => number;
  FPDFDest_GetLocationInPage: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr, arg6: Ptr) => boolean;
  FPDFDest_GetView: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => number;
  FPDFDoc_AddAttachment: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFDoc_CloseJavaScriptAction: (arg0: Ptr) => void;
  FPDFDoc_DeleteAttachment: (arg0: Ptr, arg1: number) => boolean;
  FPDFDOC_ExitFormFillEnvironment: (arg0: Ptr) => void;
  FPDFDoc_GetAttachment: (arg0: Ptr, arg1: number) => Ptr;
  FPDFDoc_GetAttachmentCount: (arg0: Ptr) => number;
  FPDFDoc_GetJavaScriptAction: (arg0: Ptr, arg1: number) => Ptr;
  FPDFDoc_GetJavaScriptActionCount: (arg0: Ptr) => number;
  FPDFDoc_GetPageMode: (arg0: Ptr) => number;
  FPDFDOC_InitFormFillEnvironment: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFFont_Close: (arg0: Ptr) => void;
  FPDFFont_GetAscent: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFFont_GetBaseFontName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFFont_GetDescent: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFFont_GetFamilyName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFFont_GetFlags: (arg0: Ptr) => number;
  FPDFFont_GetFontData: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  FPDFFont_GetGlyphPath: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  FPDFFont_GetGlyphWidth: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => boolean;
  FPDFFont_GetIsEmbedded: (arg0: Ptr) => number;
  FPDFFont_GetItalicAngle: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFFont_GetWeight: (arg0: Ptr) => number;
  FPDFFormObj_CountObjects: (arg0: Ptr) => number;
  FPDFFormObj_GetObject: (arg0: Ptr, arg1: number) => Ptr;
  FPDFFormObj_RemoveObject: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFGlyphPath_CountGlyphSegments: (arg0: Ptr) => number;
  FPDFGlyphPath_GetGlyphPathSegment: (arg0: Ptr, arg1: number) => Ptr;
  FPDFImageObj_GetBitmap: (arg0: Ptr) => Ptr;
  FPDFImageObj_GetIccProfileDataDecoded: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDFImageObj_GetImageDataDecoded: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFImageObj_GetImageDataRaw: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFImageObj_GetImageFilter: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDFImageObj_GetImageFilterCount: (arg0: Ptr) => number;
  FPDFImageObj_GetImageMetadata: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFImageObj_GetImagePixelSize: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFImageObj_GetRenderedBitmap: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => Ptr;
  FPDFImageObj_LoadJpegFile: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFImageObj_LoadJpegFileInline: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFImageObj_SetBitmap: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFImageObj_SetMatrix: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number) => boolean;
  FPDFJavaScriptAction_GetName: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFJavaScriptAction_GetScript: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFLink_CloseWebLinks: (arg0: Ptr) => void;
  FPDFLink_CountQuadPoints: (arg0: Ptr) => number;
  FPDFLink_CountRects: (arg0: Ptr, arg1: number) => number;
  FPDFLink_CountWebLinks: (arg0: Ptr) => number;
  FPDFLink_Enumerate: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFLink_GetAction: (arg0: Ptr) => Ptr;
  FPDFLink_GetAnnot: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFLink_GetAnnotRect: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFLink_GetDest: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFLink_GetLinkAtPoint: (arg0: Ptr, arg1: number, arg2: number) => Ptr;
  FPDFLink_GetLinkZOrderAtPoint: (arg0: Ptr, arg1: number, arg2: number) => number;
  FPDFLink_GetQuadPoints: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFLink_GetRect: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr, arg4: Ptr, arg5: Ptr, arg6: Ptr) => boolean;
  FPDFLink_GetTextRange: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFLink_GetURL: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number) => number;
  FPDFLink_LoadWebLinks: (arg0: Ptr) => Ptr;
  FPDFPage_CloseAnnot: (arg0: Ptr) => void;
  FPDFPage_CountObjects: (arg0: Ptr) => number;
  FPDFPage_CreateAnnot: (arg0: Ptr, arg1: number) => Ptr;
  FPDFPage_Delete: (arg0: Ptr, arg1: number) => void;
  FPDFPage_Flatten: (arg0: Ptr, arg1: number) => number;
  FPDFPage_FormFieldZOrderAtPoint: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => number;
  FPDFPage_GenerateContent: (arg0: Ptr) => boolean;
  FPDFPage_GetAnnot: (arg0: Ptr, arg1: number) => Ptr;
  FPDFPage_GetAnnotCount: (arg0: Ptr) => number;
  FPDFPage_GetAnnotIndex: (arg0: Ptr, arg1: Ptr) => number;
  FPDFPage_GetArtBox: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPage_GetBleedBox: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPage_GetCropBox: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPage_GetDecodedThumbnailData: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFPage_GetMediaBox: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPage_GetObject: (arg0: Ptr, arg1: number) => Ptr;
  FPDFPage_GetRawThumbnailData: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFPage_GetRotation: (arg0: Ptr) => number;
  FPDFPage_GetThumbnailAsBitmap: (arg0: Ptr) => Ptr;
  FPDFPage_GetTrimBox: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPage_HasFormFieldAtPoint: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => number;
  FPDFPage_HasTransparency: (arg0: Ptr) => boolean;
  FPDFPage_InsertClipPath: (arg0: Ptr, arg1: Ptr) => void;
  FPDFPage_InsertObject: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPage_InsertObjectAtIndex: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFPage_New: (arg0: Ptr, arg1: number, arg2: number, arg3: number) => Ptr;
  FPDFPage_RemoveAnnot: (arg0: Ptr, arg1: number) => boolean;
  FPDFPage_RemoveObject: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPage_SetArtBox: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => void;
  FPDFPage_SetBleedBox: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => void;
  FPDFPage_SetCropBox: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => void;
  FPDFPage_SetMediaBox: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => void;
  FPDFPage_SetRotation: (arg0: Ptr, arg1: number) => void;
  FPDFPage_SetTrimBox: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => void;
  FPDFPage_TransformAnnots: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number) => void;
  FPDFPage_TransFormWithClip: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFPageObj_AddExistingMark: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_AddMark: (arg0: Ptr, arg1: string) => Ptr;
  FPDFPageObj_CountMarks: (arg0: Ptr) => number;
  FPDFPageObj_CreateNewPath: (arg0: number, arg1: number) => Ptr;
  FPDFPageObj_CreateNewRect: (arg0: number, arg1: number, arg2: number, arg3: number) => Ptr;
  FPDFPageObj_CreateTextObj: (arg0: Ptr, arg1: Ptr, arg2: number) => Ptr;
  FPDFPageObj_Destroy: (arg0: Ptr) => void;
  FPDFPageObj_GetBounds: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPageObj_GetClipPath: (arg0: Ptr) => Ptr;
  FPDFPageObj_GetDashArray: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFPageObj_GetDashCount: (arg0: Ptr) => number;
  FPDFPageObj_GetDashPhase: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_GetFillColor: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPageObj_GetIsActive: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_GetLineCap: (arg0: Ptr) => number;
  FPDFPageObj_GetLineJoin: (arg0: Ptr) => number;
  FPDFPageObj_GetMark: (arg0: Ptr, arg1: number) => Ptr;
  FPDFPageObj_GetMarkedContentID: (arg0: Ptr) => number;
  FPDFPageObj_GetMatrix: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_GetRenderedFillPattern: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFPageObj_GetRenderedStrokePattern: (arg0: Ptr, arg1: Ptr) => Ptr;
  FPDFPageObj_GetRotatedBounds: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_GetStrokeColor: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: Ptr, arg4: Ptr) => boolean;
  FPDFPageObj_GetStrokeWidth: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_GetType: (arg0: Ptr) => number;
  FPDFPageObj_HasTransparency: (arg0: Ptr) => boolean;
  FPDFPageObj_NewImageObj: (arg0: Ptr) => Ptr;
  FPDFPageObj_NewTextObj: (arg0: Ptr, arg1: string, arg2: number) => Ptr;
  FPDFPageObj_RemoveMark: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_SetBlendMode: (arg0: Ptr, arg1: string) => void;
  FPDFPageObj_SetDashArray: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => boolean;
  FPDFPageObj_SetDashPhase: (arg0: Ptr, arg1: number) => boolean;
  FPDFPageObj_SetFillColor: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => boolean;
  FPDFPageObj_SetIsActive: (arg0: Ptr, arg1: boolean) => boolean;
  FPDFPageObj_SetLineCap: (arg0: Ptr, arg1: number) => boolean;
  FPDFPageObj_SetLineJoin: (arg0: Ptr, arg1: number) => boolean;
  FPDFPageObj_SetMatrix: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObj_SetStrokeColor: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => boolean;
  FPDFPageObj_SetStrokeWidth: (arg0: Ptr, arg1: number) => boolean;
  FPDFPageObj_Transform: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number) => void;
  FPDFPageObj_TransformClipPath: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number) => void;
  FPDFPageObj_TransformF: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFPageObjMark_CountParams: (arg0: Ptr) => number;
  FPDFPageObjMark_GetName: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: Ptr) => boolean;
  FPDFPageObjMark_GetParamBlobValue: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDFPageObjMark_GetParamFloatValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  FPDFPageObjMark_GetParamIntValue: (arg0: Ptr, arg1: string, arg2: Ptr) => boolean;
  FPDFPageObjMark_GetParamKey: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDFPageObjMark_GetParamStringValue: (arg0: Ptr, arg1: string, arg2: Ptr, arg3: number, arg4: Ptr) => boolean;
  FPDFPageObjMark_GetParamValueType: (arg0: Ptr, arg1: string) => number;
  FPDFPageObjMark_RemoveParam: (arg0: Ptr, arg1: Ptr, arg2: string) => boolean;
  FPDFPageObjMark_SetBlobParam: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: string, arg4: Ptr, arg5: number) => boolean;
  FPDFPageObjMark_SetFloatParam: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: string, arg4: number) => boolean;
  FPDFPageObjMark_SetIntParam: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: string, arg4: number) => boolean;
  FPDFPageObjMark_SetStringParam: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: string, arg4: string) => boolean;
  FPDFPath_BezierTo: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number) => boolean;
  FPDFPath_Close: (arg0: Ptr) => boolean;
  FPDFPath_CountSegments: (arg0: Ptr) => number;
  FPDFPath_GetBezierControlPoints: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFPath_GetDrawMode: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFPath_GetPathSegment: (arg0: Ptr, arg1: number) => Ptr;
  FPDFPath_LineTo: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  FPDFPath_MoveTo: (arg0: Ptr, arg1: number, arg2: number) => boolean;
  FPDFPath_SetDrawMode: (arg0: Ptr, arg1: number, arg2: boolean) => boolean;
  FPDFPathSegment_GetClose: (arg0: Ptr) => boolean;
  FPDFPathSegment_GetPoint: (arg0: Ptr, arg1: Ptr, arg2: Ptr) => boolean;
  FPDFPathSegment_GetType: (arg0: Ptr) => number;
  FPDFSignatureObj_GetByteRange: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFSignatureObj_GetContents: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFSignatureObj_GetDocMDPPermission: (arg0: Ptr) => number;
  FPDFSignatureObj_GetReason: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFSignatureObj_GetSubFilter: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFSignatureObj_GetTime: (arg0: Ptr, arg1: Ptr, arg2: number) => number;
  FPDFText_ClosePage: (arg0: Ptr) => void;
  FPDFText_CountChars: (arg0: Ptr) => number;
  FPDFText_CountRects: (arg0: Ptr, arg1: number, arg2: number) => number;
  FPDFText_FindClose: (arg0: Ptr) => void;
  FPDFText_FindNext: (arg0: Ptr) => boolean;
  FPDFText_FindPrev: (arg0: Ptr) => boolean;
  FPDFText_FindStart: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number) => Ptr;
  FPDFText_GetBoundedText: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number, arg5: Ptr, arg6: number) => number;
  FPDFText_GetCharAngle: (arg0: Ptr, arg1: number) => number;
  FPDFText_GetCharBox: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  FPDFText_GetCharIndexAtPos: (arg0: Ptr, arg1: number, arg2: number, arg3: number, arg4: number) => number;
  FPDFText_GetCharIndexFromTextIndex: (arg0: Ptr, arg1: number) => number;
  FPDFText_GetCharOrigin: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr) => boolean;
  FPDFText_GetFillColor: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  FPDFText_GetFontInfo: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: number, arg4: Ptr) => number;
  FPDFText_GetFontSize: (arg0: Ptr, arg1: number) => number;
  FPDFText_GetFontWeight: (arg0: Ptr, arg1: number) => number;
  FPDFText_GetLooseCharBox: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFText_GetMatrix: (arg0: Ptr, arg1: number, arg2: Ptr) => boolean;
  FPDFText_GetRect: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  FPDFText_GetSchCount: (arg0: Ptr) => number;
  FPDFText_GetSchResultIndex: (arg0: Ptr) => number;
  FPDFText_GetStrokeColor: (arg0: Ptr, arg1: number, arg2: Ptr, arg3: Ptr, arg4: Ptr, arg5: Ptr) => boolean;
  FPDFText_GetText: (arg0: Ptr, arg1: number, arg2: number, arg3: Ptr) => number;
  FPDFText_GetTextIndexFromCharIndex: (arg0: Ptr, arg1: number) => number;
  FPDFText_GetTextObject: (arg0: Ptr, arg1: number) => Ptr;
  FPDFText_GetUnicode: (arg0: Ptr, arg1: number) => number;
  FPDFText_HasUnicodeMapError: (arg0: Ptr, arg1: number) => number;
  FPDFText_IsGenerated: (arg0: Ptr, arg1: number) => number;
  FPDFText_IsHyphen: (arg0: Ptr, arg1: number) => number;
  FPDFText_LoadCidType2Font: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: string, arg4: Ptr, arg5: number) => Ptr;
  FPDFText_LoadFont: (arg0: Ptr, arg1: Ptr, arg2: number, arg3: number, arg4: boolean) => Ptr;
  FPDFText_LoadPage: (arg0: Ptr) => Ptr;
  FPDFText_LoadStandardFont: (arg0: Ptr, arg1: string) => Ptr;
  FPDFText_SetCharcodes: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFText_SetPositions: (arg0: Ptr, arg1: Ptr, arg2: number) => boolean;
  FPDFText_SetText: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFTextObj_GetFont: (arg0: Ptr) => Ptr;
  FPDFTextObj_GetFontSize: (arg0: Ptr, arg1: Ptr) => boolean;
  FPDFTextObj_GetRenderedBitmap: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => Ptr;
  FPDFTextObj_GetText: (arg0: Ptr, arg1: Ptr, arg2: Ptr, arg3: number) => number;
  FPDFTextObj_GetTextRenderMode: (arg0: Ptr) => number;
  FPDFTextObj_SetFontSize: (arg0: Ptr, arg1: number) => boolean;
  FPDFTextObj_SetTextRenderMode: (arg0: Ptr, arg1: number) => boolean;
}

export type PdfFunctionTsKind = 'Ptr' | 'number' | 'string' | 'boolean' | 'bigint' | 'void';
export type PdfFunctionAbiKind = 'void' | 'bool' | 'i32' | 'i64' | 'f32' | 'f64' | 'pointer' | 'cstring' | 'utf16ptr';
export type PdfFunctionCwrapKind = 'number' | 'string' | 'boolean' | 'bigint' | null;
export interface PdfFunctionAbiTarget {
  readonly kind: PdfFunctionAbiKind;
  readonly cwrap: PdfFunctionCwrapKind;
}
export interface PdfFunctionAbiSlot {
  readonly ts: PdfFunctionTsKind;
  readonly wasm: PdfFunctionAbiTarget;
  readonly native: PdfFunctionAbiTarget;
}
export interface PdfFunctionSignature {
  readonly params: readonly PdfFunctionAbiSlot[];
  readonly result: PdfFunctionAbiSlot | null;
}

/** Every distinct parameter or result slot, referred to by index below. */
const SLOTS: readonly PdfFunctionAbiSlot[] = [
  {"ts":"boolean","wasm":{"kind":"bool","cwrap":"boolean"},"native":{"kind":"bool","cwrap":"boolean"}},
  {"ts":"Ptr","wasm":{"kind":"pointer","cwrap":"number"},"native":{"kind":"pointer","cwrap":"bigint"}},
  {"ts":"string","wasm":{"kind":"cstring","cwrap":"string"},"native":{"kind":"cstring","cwrap":"string"}},
  {"ts":"number","wasm":{"kind":"i32","cwrap":"number"},"native":{"kind":"i32","cwrap":"number"}},
  {"ts":"Ptr","wasm":{"kind":"cstring","cwrap":"number"},"native":{"kind":"cstring","cwrap":"bigint"}},
  {"ts":"number","wasm":{"kind":"f32","cwrap":"number"},"native":{"kind":"f32","cwrap":"number"}},
  {"ts":"Ptr","wasm":{"kind":"utf16ptr","cwrap":"number"},"native":{"kind":"utf16ptr","cwrap":"bigint"}},
  {"ts":"bigint","wasm":{"kind":"i64","cwrap":"bigint"},"native":{"kind":"i64","cwrap":"bigint"}},
  {"ts":"number","wasm":{"kind":"f64","cwrap":"number"},"native":{"kind":"f64","cwrap":"number"}},
];

/** One function per line: its name, its result slot (`-` for void), its parameter slots. */
const TABLE = `
EPDF_CheckPasswordPermissions 0 1 2 1 1 1 1
EPDF_DigestBuffer 0 1 3 3 4 1
EPDF_FreeBuffer - 1
EPDF_GetDecodedImageBytes 3
EPDF_GetMetaKeyCount 3 1 0
EPDF_GetMetaKeyName 3 1 3 0 1 3
EPDF_GetMetaTrapped 3 1
EPDF_GetPageBoxByIndex 0 1 3 3 1
EPDF_GetPageRotateByIndex 0 1 3 1
EPDF_GetPageTabOrderByIndex 3 1 3 1 3
EPDF_GetPageUserUnitByIndex 0 1 3 1
EPDF_HasMetaText 0 1 2
EPDF_InitThread -
EPDF_IsEncrypted 0 1
EPDF_IsOwnerUnlocked 0 1
EPDF_LoadBaseDocument 1 1 2
EPDF_LoadMemBaseDocument 1 1 3 2
EPDF_LoadMemBaseDocument64 1 1 3 2
EPDF_LoadPageNormalized 1 1 3 1
EPDF_PNG_EncodeRGBA 3 4 3 3 3 3 4
EPDF_ReleaseBaseDocument - 1
EPDF_RemoveEncryption 0 1
EPDF_RenderAnnotBitmap 0 1 1 1 3 2 1 3
EPDF_RenderAnnotBitmapUnrotated 0 1 1 1 3 2 5 1 1 3
EPDF_RenderPage_Continue 3 1 3
EPDF_RenderPageBitmapWithMatrix_Start 3 1 1 1 1 3 3
EPDF_SaveAsCopyEx 0 1 1 3 1
EPDF_SaveDocumentToOwnedBuffer 1 1 3 1
EPDF_SaveDocumentToOwnedBufferEx 1 1 3 3 1 1
EPDF_SaveDocumentToOwnedBufferWithVersion 1 1 3 1 3
EPDF_SetBaseDocumentSha256 - 1 4
EPDF_SetDecodedImageBudget - 3
EPDF_SetEncryption 0 1 2 2 3
EPDF_SetMetaText 0 1 2 1
EPDF_SetMetaTrapped 0 1 3
EPDF_SetRuntimeOwnerPermissions 0 1 0
EPDF_ShutdownThread -
EPDF_UnlockOwnerPermissions 0 1 2
EPDFAction_CloseModel - 1
EPDFAction_CreateGoTo 1 1 1
EPDFAction_CreateGoToNamed 1 1 2
EPDFAction_CreateHide 1 1 1 3 0
EPDFAction_CreateJavaScript 1 1 1
EPDFAction_CreateLaunch 1 1 1
EPDFAction_CreateNamed 1 1 2
EPDFAction_CreateRemoteGoToByName 1 1 1 1
EPDFAction_CreateRemoteGoToDest 1 1 1 1
EPDFAction_CreateResetForm 1 1 1 3 0
EPDFAction_CreateSubmitForm 1 1 1 1 3 3
EPDFAction_CreateURI 1 1 2
EPDFAction_GetNextAt 3 1 3 3
EPDFAction_GetNextCount 3 1 3
EPDFAction_GetNodeCount 3 1
EPDFAction_GetNodeDest 1 1 1 3
EPDFAction_GetNodeFilePath 3 1 3 1 3
EPDFAction_GetNodeHideFlag 0 1 3 1
EPDFAction_GetNodeJavaScript 3 1 3 6 3
EPDFAction_GetNodeName 3 1 3 1 3
EPDFAction_GetNodeResetForm 0 1 3 1 1
EPDFAction_GetNodeSubmitForm 0 1 3 1 1
EPDFAction_GetNodeSubmitFormCharSet 3 1 3 1 3
EPDFAction_GetNodeSubmitFormURL 3 1 3 1 3
EPDFAction_GetNodeSubtype 3 1 3 4 3
EPDFAction_GetNodeTargetCount 3 1 3
EPDFAction_GetNodeTargetName 3 1 3 3 1 3
EPDFAction_GetNodeTargetObjectNumber 0 1 3 3 1
EPDFAction_GetNodeType 3 1 3
EPDFAction_GetNodeURI 3 1 1 3 1 3
EPDFAction_GetNodeURIIsMap 0 1 3 1
EPDFAction_GetRootNode 3 1
EPDFAction_GetWarningFlags 3 1
EPDFAction_IsComplete 0 1
EPDFAction_LoadModel 1 1
EPDFAction_NodeHasJavaScript 0 1 3
EPDFAction_SetNext 0 1 1 1 3
EPDFAnnot_AddMeasure 1 1
EPDFAnnot_ClearBorderEffect 0 1
EPDFAnnot_ClearColor 0 1 3
EPDFAnnot_ClearEmbedMetadata 0 1
EPDFAnnot_ClearEmbedMetadataKey 0 1 2
EPDFAnnot_ClearMKColor 0 1 3
EPDFAnnot_ClearMKIcon 0 1 3
EPDFAnnot_ClearRectangleDifferences 0 1
EPDFAnnot_ExportAppearance 1 1 5 1
EPDFAnnot_GenerateAppearance 0 1
EPDFAnnot_GenerateAppearanceWithBlend 0 1 3
EPDFAnnot_GenerateFormFieldAP 0 1
EPDFAnnot_GetActionModel 1 1 3
EPDFAnnot_GetAPMatrix 0 1 3 1
EPDFAnnot_GetAppearanceState 3 1 1 3
EPDFAnnot_GetAppearanceStateCount 3 1 3
EPDFAnnot_GetAppearanceStateName 3 1 3 3 1 3
EPDFAnnot_GetAppearanceTransform 0 1 1 1
EPDFAnnot_GetAvailableAppearanceModes 3 1
EPDFAnnot_GetBlendMode 3 1
EPDFAnnot_GetBooleanValue 0 1 2 1
EPDFAnnot_GetBorderDashPattern 0 1 1 3
EPDFAnnot_GetBorderDashPatternCount 3 1
EPDFAnnot_GetBorderEffect 0 1 1
EPDFAnnot_GetBorderStyle 3 1 1
EPDFAnnot_GetCalloutLine 3 1 1 3
EPDFAnnot_GetCalloutLineCount 3 1
EPDFAnnot_GetColor 0 1 3 1 1 1
EPDFAnnot_GetDefaultAppearance 0 1 1 1 1 1 1
EPDFAnnot_GetDefaultAppearanceFontFace 3 1 6 3 1 1
EPDFAnnot_GetDefaultAppearanceFontPostScriptName 3 1 4 3
EPDFAnnot_GetDrawing 3 1
EPDFAnnot_GetDrawingRect 0 1 3 1
EPDFAnnot_GetEmbedMetadataBoolean 0 1 2 1
EPDFAnnot_GetEmbedMetadataJSON 3 1 6 3
EPDFAnnot_GetEmbedMetadataNumber 0 1 2 1
EPDFAnnot_GetEmbedMetadataRect 0 1 2 1
EPDFAnnot_GetEmbedMetadataString 3 1 2 6 3
EPDFAnnot_GetFileAttachmentForWrite 1 1
EPDFAnnot_GetIntent 3 1 6 3
EPDFAnnot_GetLineCaption 0 1 1 1 1
EPDFAnnot_GetLineEndings 0 1 1 1
EPDFAnnot_GetLineLeader 0 1 1 1 1
EPDFAnnot_GetMeasure 1 1
EPDFAnnot_GetMKColor 0 1 3 1 1 1
EPDFAnnot_GetMKIcon 3 1 3
EPDFAnnot_GetMKRotation 3 1
EPDFAnnot_GetMKText 3 1 3 6 3
EPDFAnnot_GetMKTextPosition 3 1
EPDFAnnot_GetName 3 1 4 3
EPDFAnnot_GetObjectNumber 3 1
EPDFAnnot_GetOpacity 0 1 1
EPDFAnnot_GetOverlayText 3 1 6 3
EPDFAnnot_GetOverlayTextRepeat 0 1
EPDFAnnot_GetRect 0 1 1
EPDFAnnot_GetRectangleDifferences 0 1 1 1 1 1
EPDFAnnot_GetReplyType 3 1
EPDFAnnot_GetRichContent 3 1 6 3
EPDFAnnot_GetRichTextJSON 3 1 4 3
EPDFAnnot_GetRotate 0 1 1
EPDFAnnot_GetShapeCaption 0 1 1 1 1
EPDFAnnot_GetStructurePosition 3 1 1 3
EPDFAnnot_GetTextAlignment 3 1
EPDFAnnot_HasAppearanceStream 0 1 3
EPDFAnnot_HasEmbedMetadata 0 1
EPDFAnnot_HasMKIcon 0 1 3
EPDFAnnot_IsValid 0 1
EPDFAnnot_RemoveAction 0 1
EPDFAnnot_RemoveDest 0 1
EPDFAnnot_RemoveKey 0 1 2
EPDFAnnot_RemoveMeasure 0 1
EPDFAnnot_SetAction 0 1 1
EPDFAnnot_SetAPMatrix 0 1 3 1
EPDFAnnot_SetAppearanceFromPage 0 1 1 3
EPDFAnnot_SetBooleanValue 0 1 2 0
EPDFAnnot_SetBorderDashPattern 0 1 1 3
EPDFAnnot_SetBorderEffect 0 1 5
EPDFAnnot_SetBorderStyle 0 1 3 5
EPDFAnnot_SetCalloutLine 0 1 1 3
EPDFAnnot_SetColor 0 1 3 3 3 3
EPDFAnnot_SetDefaultAppearance 0 1 3 5 3 3 3
EPDFAnnot_SetDefaultAppearanceDocumentFont 0 1 3 5 3 3 3
EPDFAnnot_SetDefaultAppearanceRegisteredFont 0 1 3 5 3 3 3
EPDFAnnot_SetDrawing 0 1 3 3
EPDFAnnot_SetEmbedMetadataBoolean 0 1 2 0
EPDFAnnot_SetEmbedMetadataJSON 0 1 1
EPDFAnnot_SetEmbedMetadataNumber 0 1 2 5
EPDFAnnot_SetEmbedMetadataRect 0 1 2 1
EPDFAnnot_SetEmbedMetadataString 0 1 2 1
EPDFAnnot_SetEventAction 0 1 3 1
EPDFAnnot_SetIntent 0 1 2
EPDFAnnot_SetLine 0 1 1 1
EPDFAnnot_SetLineCaption 0 1 0 3 1
EPDFAnnot_SetLineEndings 0 1 3 3
EPDFAnnot_SetLineLeader 0 1 5 5 5
EPDFAnnot_SetLinkedAnnot 0 1 2 1
EPDFAnnot_SetMKColor 0 1 3 3 3 3
EPDFAnnot_SetMKIcon 0 1 3 3
EPDFAnnot_SetMKRotation 0 1 3
EPDFAnnot_SetMKText 0 1 3 1
EPDFAnnot_SetMKTextPosition 0 1 3
EPDFAnnot_SetName 0 1 2
EPDFAnnot_SetNoColor 0 1 3
EPDFAnnot_SetNumberValue 0 1 2 5
EPDFAnnot_SetOpacity 0 1 5
EPDFAnnot_SetOverlayText 0 1 1
EPDFAnnot_SetOverlayTextRepeat 0 1 0
EPDFAnnot_SetRect 0 1 1
EPDFAnnot_SetReplyType 0 1 3
EPDFAnnot_SetRichTextJSON 0 1 2
EPDFAnnot_SetRichTextXHTML 0 1 1
EPDFAnnot_SetRotate 0 1 5
EPDFAnnot_SetShapeCaption 0 1 0 1
EPDFAnnot_SetStampOpacity 0 1 3 5
EPDFAnnot_SetSubtype 0 1 3
EPDFAnnot_SetTextAlignment 0 1 3
EPDFAnnot_SetVertices 0 1 1 3
EPDFAnnot_UpdateAppearanceToRect 0 1 3
EPDFAttachment_ExportCanonicalToOwnedBuffer 1 1 1 1
EPDFAttachment_ExportRawToOwnedBuffer 1 1 1 1
EPDFAttachment_ExtractFile 0 1 1 7 1 1
EPDFAttachment_ExtractFileToOwnedBuffer 0 1 7 1 1 1
EPDFAttachment_GetDescription 3 1 6 3
EPDFAttachment_GetIntegerValue 0 1 2 1
EPDFAttachment_ImportRaw 0 1 1 3
EPDFAttachment_SetDescription 0 1 1
EPDFAttachment_SetName 0 1 1
EPDFAttachment_SetSubtype 0 1 2
EPDFCatalog_GetLanguage 3 1 1 3
EPDFCatalog_GetMetadata 3 1 1 3
EPDFCatalog_SetMetadata 0 1 1 3
EPDFDest_CreateRemoteView 1 1 3 3 1 3
EPDFDest_CreateRemoteXYZ 1 1 3 0 5 0 5 0 5
EPDFDest_CreateView 1 1 3 1 3
EPDFDest_CreateViewByObjectNumber 1 1 3 3 1 3
EPDFDest_CreateXYZ 1 1 0 5 0 5 0 5
EPDFDest_CreateXYZByObjectNumber 1 1 3 0 5 0 5 0 5
EPDFDest_GetPageObjectNumber 3 1 1
EPDFDest_GetViewNullParams 3 1
EPDFDoc_CanonicalDrawing 1 1 3
EPDFDoc_ClearMissingCharacters - 1
EPDFDoc_ClearPagePieceInfoEntry 0 1 3 2
EPDFDoc_ClearPagePieceInfoKey 0 1 3 2 2 1
EPDFDoc_ClearPieceInfoEntry 0 1 2
EPDFDoc_ClearPieceInfoKey 0 1 2 2 1
EPDFDoc_CompareRevisions 1 1 1
EPDFDoc_CountMissingCharacters 3 1
EPDFDoc_DeletePageByObjectNumber 0 1 3
EPDFDoc_ExportDictCanonicalToOwnedBuffer 1 1 3 2 2 1
EPDFDoc_ExportDictRawToOwnedBuffer 1 1 3 2 1
EPDFDoc_ExportDrawing 1 1 3
EPDFDoc_ExportPagesFlattened 1 1 1 3 3 3
EPDFDoc_GetAdditionalActionModel 1 1 3
EPDFDoc_GetAttachmentIndexByKey 3 1 1
EPDFDoc_GetAttachmentKey 3 1 3 6 3
EPDFDoc_GetBaseBytesSize 7 1
EPDFDoc_GetDrawings 3 1 1 3
EPDFDoc_GetFontDisplayProgramCoverage 3 1 4 1 3
EPDFDoc_GetFontDisplayProgramData 3 1 4 1 3
EPDFDoc_GetFontEmbeddingPolicy 3 1
EPDFDoc_GetFontProgramData 3 1 3 1 3
EPDFDoc_GetFontsFingerprint 0 1 4
EPDFDoc_GetImportFieldRoots 3 1 1 3 1 3
EPDFDoc_GetLastModified 3 1 6 3
EPDFDoc_GetLoadedBytesSize 7 1
EPDFDoc_GetLoadedObjectValue 3 1 3 4 3 1 1
EPDFDoc_GetMissingCharacter 3 1 3 6 3
EPDFDoc_GetNamedJavaScriptActionModel 1 1 3
EPDFDoc_GetNamedPageAt 3 1 3 3 6 3 1 1
EPDFDoc_GetNamedPageCount 3 1 3
EPDFDoc_GetOpenActionDest 1 1
EPDFDoc_GetOpenActionModel 1 1
EPDFDoc_GetPageActionModel 1 1 3 3
EPDFDoc_GetPageLabelSectionAt 3 1 3 6 3 1 1 1
EPDFDoc_GetPageLabelSectionCount 3 1
EPDFDoc_GetPageLastModified 3 1 3 6 3
EPDFDoc_GetPageObjectNumberByIndex 3 1 3
EPDFDoc_GetPagePieceInfoBoolean 0 1 3 2 2 1
EPDFDoc_GetPagePieceInfoEntryAt 3 1 3 3 4 3
EPDFDoc_GetPagePieceInfoEntryCount 3 1 3
EPDFDoc_GetPagePieceInfoKeyAt 3 1 3 2 3 4 3
EPDFDoc_GetPagePieceInfoKeyCount 3 1 3 2
EPDFDoc_GetPagePieceInfoLastModified 3 1 3 2 6 3
EPDFDoc_GetPagePieceInfoName 3 1 3 2 2 4 3
EPDFDoc_GetPagePieceInfoNumber 0 1 3 2 2 1
EPDFDoc_GetPagePieceInfoString 3 1 3 2 2 6 3
EPDFDoc_GetPagePieceInfoStringArrayAt 3 1 3 2 2 3 6 3
EPDFDoc_GetPagePieceInfoStringArrayCount 3 1 3 2 2
EPDFDoc_GetPagePieceInfoValueType 3 1 3 2 2
EPDFDoc_GetPieceInfoBoolean 0 1 2 2 1
EPDFDoc_GetPieceInfoEntryAt 3 1 3 4 3
EPDFDoc_GetPieceInfoEntryCount 3 1
EPDFDoc_GetPieceInfoKeyAt 3 1 2 3 4 3
EPDFDoc_GetPieceInfoKeyCount 3 1 2
EPDFDoc_GetPieceInfoLastModified 3 1 2 6 3
EPDFDoc_GetPieceInfoName 3 1 2 2 4 3
EPDFDoc_GetPieceInfoNumber 0 1 2 2 1
EPDFDoc_GetPieceInfoString 3 1 2 2 6 3
EPDFDoc_GetPieceInfoStringArrayAt 3 1 2 2 3 6 3
EPDFDoc_GetPieceInfoStringArrayCount 3 1 2 2
EPDFDoc_GetPieceInfoValueType 3 1 2 2
EPDFDoc_GetRevision 0 1 3 1 1
EPDFDoc_GetRevisionCount 3 1
EPDFDoc_GetStructureObjectNumbers 0 1 1 1 1
EPDFDoc_GetTypographicFeatures 0 1
EPDFDoc_HasPagePieceInfoEntry 0 1 3 2
EPDFDoc_HasPieceInfoEntry 0 1 2
EPDFDoc_ImportDictRaw 0 1 1 3
EPDFDoc_ImportDrawing 3 1 1
EPDFDoc_ImportPages 0 1 1 1 3 3 1
EPDFDoc_LoadPageByObjectNumber 1 1 3
EPDFDoc_LoadPageByObjectNumberNormalized 1 1 3
EPDFDoc_OpenBaseOverlay 1 1 1 3
EPDFDoc_OpenBaseOverlayFromPath 1 1 4
EPDFDoc_OpenRevision 1 1 7
EPDFDoc_ReadLoadedBytes 3 1 7 1 3
EPDFDoc_RemoveNamedPage 0 1 1
EPDFDoc_RemoveNamedPagesForPage 3 1 3
EPDFDoc_ResolveFonts 1 1 1 3 6 6 1 1 1
EPDFDoc_SetFontEmbeddingPolicy 0 1 3
EPDFDoc_SetNamedPage 0 1 1 3
EPDFDoc_SetPageLabelSections 0 1 1 1 1 6 3
EPDFDoc_SetPagePieceInfoBoolean 0 1 3 2 2 0 1
EPDFDoc_SetPagePieceInfoName 0 1 3 2 2 2 1
EPDFDoc_SetPagePieceInfoNumber 0 1 3 2 2 5 1
EPDFDoc_SetPagePieceInfoString 0 1 3 2 2 1 1
EPDFDoc_SetPagePieceInfoStringArray 0 1 3 2 2 6 3 1
EPDFDoc_SetPageRotationByObjectNumber 0 1 3 3
EPDFDoc_SetPieceInfoBoolean 0 1 2 2 0 1
EPDFDoc_SetPieceInfoName 0 1 2 2 2 1
EPDFDoc_SetPieceInfoNumber 0 1 2 2 5 1
EPDFDoc_SetPieceInfoString 0 1 2 2 1 1
EPDFDoc_SetPieceInfoStringArray 0 1 2 2 6 3 1
EPDFDoc_SetTypographicFeatures 0 1 0
EPDFDoc_StartLoadPageByObjectNumber 1 1 3 0
EPDFDocument_ClearEmbedMetadata 0 1
EPDFDss_Add 3 1 3 1 3
EPDFDss_GetCount 3 1 3
EPDFDss_GetData 3 1 3 3 1 3
EPDFFont_AddFallbackFont 0 3 3
EPDFFont_AuthorizeEditing 0 3
EPDFFont_ClearFallbackFonts -
EPDFFont_ClearRegisteredFonts -
EPDFFont_GetCoverage 3 3 1 3
EPDFFont_GetEmbeddingPermission 3 3
EPDFFont_GetFallbackOrder 3 3 0 1 3
EPDFFont_GetFamilyName 3 3 4 3
EPDFFont_GetLastResortFont 3
EPDFFont_GetMetrics 0 3 1 1
EPDFFont_GetPostScriptName 3 3 4 3
EPDFFont_GetProgramData 3 3 1 3
EPDFFont_GetProgramFormat 3 3
EPDFFont_GetProgramHash 0 3 4
EPDFFont_GetWeight 3 3
EPDFFont_IsEditingAuthorized 0 3
EPDFFont_IsInstanced 0 3
EPDFFont_IsItalic 0 3
EPDFFont_RegisterFont 3 2 3 3 1
EPDFFont_RegisterMemFont 3 2 3 3 1 3
EPDFFont_RegisterMemFont64 3 2 3 3 1 3
EPDFFont_SetLastResortFont 0 3
EPDFFontFaces_Close - 1
EPDFFontFaces_Count 3 1
EPDFFontFaces_CountPrograms 3 1 3
EPDFFontFaces_GetFamily 3 1 3 6 3
EPDFFontFaces_GetProgramDisplayHash 0 1 3 3 4
EPDFFontFaces_GetProgramEmbedded 3 1 3 3
EPDFFontFaces_GetProgramEmbeddingPermission 3 1 3 3
EPDFFontFaces_GetProgramFormat 3 1 3 3
EPDFFontFaces_GetProgramHash 0 1 3 3 4
EPDFFontFaces_GetProgramMetrics 0 1 3 3 1 1
EPDFFontFaces_GetProgramObjNum 3 1 3 3
EPDFFontFaces_GetProgramPostScriptName 3 1 3 3 4 3
EPDFFontFaces_GetWeight 3 1 3
EPDFFontFaces_IsItalic 0 1 3
EPDFFontFaces_Load 1 1
EPDFFontFaces_ProgramMapsUnicode 0 1 3 3
EPDFFontResolution_Close - 1
EPDFFontResolution_CountMissingCharacters 3 1
EPDFFontResolution_GetBaseFontName 3 1 3 4 3
EPDFFontResolution_GetFallbacks 3 1 3 1 3
EPDFFontResolution_GetFamily 3 1 3 6 3
EPDFFontResolution_GetMissingCharacter 3 1 3 6 3
EPDFFontResolution_GetProgramDisplayHash 0 1 3 4
EPDFFontResolution_GetProgramObjNum 3 1 3
EPDFFontResolution_GetRegisteredFont 3 1 3
EPDFFontResolution_GetSource 3 1 3
EPDFFontResolution_GetWeight 3 1 3
EPDFFontResolution_IsDegraded 0 1 3
EPDFFontResolution_IsItalic 0 1 3
EPDFForm_AttachWidget 0 1 3 3 2 3
EPDFForm_ClearFieldEmbedMetadata 0 1 3
EPDFForm_ClearFieldEmbedMetadataKey 0 1 3 2
EPDFForm_CloseModel - 1
EPDFForm_CountCalculationOrder 3 1
EPDFForm_CountFieldDefaultValues 3 1 3
EPDFForm_CountFieldOptions 3 1 3
EPDFForm_CountFields 3 1
EPDFForm_CountFieldValues 3 1 3
EPDFForm_CountFieldWidgets 3 1 3
EPDFForm_CreateField 3 1 3 1 3
EPDFForm_DeleteField 0 1 3 1 3 1
EPDFForm_DetachWidget 0 1 3 3
EPDFForm_ExportFDF 3 1 1 3 1 3
EPDFForm_ExportFieldRawToOwnedBuffer 1 1 3 1
EPDFForm_ExportXFDF 3 1 1 3 1 3
EPDFForm_GetCalculationOrderFieldIndex 3 1 3
EPDFForm_GetFieldActionModel 1 1 3 3
EPDFForm_GetFieldAlternateName 3 1 3 6 3
EPDFForm_GetFieldDefaultValueAt 3 1 3 3 6 3
EPDFForm_GetFieldDefaultValueKind 3 1 3
EPDFForm_GetFieldEmbedMetadataBoolean 0 1 3 2 1
EPDFForm_GetFieldEmbedMetadataJSON 3 1 3 6 3
EPDFForm_GetFieldEmbedMetadataNumber 0 1 3 2 1
EPDFForm_GetFieldEmbedMetadataString 3 1 3 2 6 3
EPDFForm_GetFieldFamily 3 1 3
EPDFForm_GetFieldFlags 3 1 3
EPDFForm_GetFieldIndexByObjNum 3 1 3
EPDFForm_GetFieldIndexForWidget 3 1 3
EPDFForm_GetFieldMappingName 3 1 3 6 3
EPDFForm_GetFieldMaxLen 3 1 3
EPDFForm_GetFieldName 3 1 3 6 3
EPDFForm_GetFieldObjNum 3 1 3
EPDFForm_GetFieldOptionLabel 3 1 3 3 6 3
EPDFForm_GetFieldOptionValue 3 1 3 3 6 3
EPDFForm_GetFieldOrigin 3 1 3
EPDFForm_GetFieldPartialName 3 1 3 6 3
EPDFForm_GetFieldTopIndex 3 1 3
EPDFForm_GetFieldValueAt 3 1 3 3 6 3
EPDFForm_GetFieldValueKind 3 1 3
EPDFForm_GetFieldWidgetExportValue 3 1 3 3 6 3
EPDFForm_GetFieldWidgetObjNum 3 1 3 3
EPDFForm_GetFieldWidgetOnState 3 1 3 3 1 3
EPDFForm_GetFieldWidgetPageObjNum 3 1 3 3
EPDFForm_GetFieldWidgetRect 0 1 3 3 1
EPDFForm_GetFormKind 3 1
EPDFForm_GetNeedAppearances 0 1
EPDFForm_HasFieldEmbedMetadata 0 1 3
EPDFForm_ImportFieldRaw 0 1 1 3
EPDFForm_IsFieldOptionSelected 0 1 3 3
EPDFForm_IsFieldWidgetChecked 0 1 3 3
EPDFForm_LoadModel 1 1
EPDFForm_RedrawFieldWidgets 0 1 3 1 3 1
EPDFForm_Repair 0 1 3 1
EPDFForm_SetCalculationOrder 0 1 1 3
EPDFForm_SetFieldAlternateName 0 1 3 1
EPDFForm_SetFieldAppearanceText 0 1 3 1 1 3 1
EPDFForm_SetFieldDefaultValue 0 1 3 3 6 3
EPDFForm_SetFieldDisplay 0 1 3 3 1 3 1
EPDFForm_SetFieldEmbedMetadataBoolean 0 1 3 2 0
EPDFForm_SetFieldEmbedMetadataJSON 0 1 3 1
EPDFForm_SetFieldEmbedMetadataNumber 0 1 3 2 5
EPDFForm_SetFieldEmbedMetadataString 0 1 3 2 1
EPDFForm_SetFieldEventAction 0 1 3 3 1
EPDFForm_SetFieldFlags 0 1 3 3 3
EPDFForm_SetFieldMappingName 0 1 3 1
EPDFForm_SetFieldMaxLen 0 1 3 3
EPDFForm_SetFieldName 0 1 3 1
EPDFForm_SetFieldOptions 0 1 3 6 6 3
EPDFForm_SetFieldSelectedIndices 0 1 3 1 3
EPDFForm_SetFieldValue 0 1 3 3 6 3
EPDFForm_SetFieldWidgetsChecked 0 1 3 1 3 1 3 1
EPDFImageObj_SetJpeg 0 1 3 1 4 3
EPDFImageObj_SetPng 0 1 3 1 4 3
EPDFLayer_AbortTransaction 0 1
EPDFLayer_BeginTransaction 0 1
EPDFLayer_CommitTransaction 0 1
EPDFLayer_GetBaseDocument 1 1
EPDFLayer_GetBaseSha256 0 1 4
EPDFLayer_GetBirthName 0 1 3 1 1
EPDFLayer_GetBirthObjectNumber 3 1 3 3
EPDFLayer_GetLastObjectNumber 3 1
EPDFLayer_GetPromotedObjectCount 3 1
EPDFLayer_IsInTransaction 0 1
EPDFLayer_IsObjectPromoted 0 1 3
EPDFLayer_IsPagePromoted 0 1 3
EPDFLayer_OpenLayer 1 1 1 2 1
EPDFLayer_OpenLayerArtifact 1 1 1 2 1
EPDFLayer_OpenLayerArtifactFromPath 1 1 4 2 1
EPDFLayer_RaiseLastObjectNumber 0 1 3
EPDFLayer_SaveDelta 0 1 1 1
EPDFLayer_SaveDeltaEx 0 1 1 1 1
EPDFLayer_SaveDeltaToOwnedBuffer 1 1 1 1
EPDFLayer_SaveDeltaToOwnedBufferEx 1 1 1 1 1
EPDFLayer_SaveLayerArtifact 0 1 1 1
EPDFLayer_SaveLayerArtifactEx 0 1 1 1 1
EPDFLayer_SaveLayerArtifactToOwnedBuffer 1 1 1 1
EPDFLayer_SaveLayerArtifactToOwnedBufferEx 1 1 1 1 1
EPDFMeasure_AddFormat 1 1 3 1 5
EPDFMeasure_CountFormats 3 1 3
EPDFMeasure_GetCYX 0 1 1
EPDFMeasure_GetFormat 1 1 3 3
EPDFMeasure_GetOrigin 0 1 1
EPDFMeasure_GetRatio 3 1 6 3
EPDFMeasure_GetSubtype 3 1
EPDFMeasure_RemoveFormats 0 1 3
EPDFMeasure_SetCYX 0 1 1
EPDFMeasure_SetOrigin 0 1 1
EPDFMeasure_SetRatio 0 1 1
EPDFNamedDest_Remove 0 1 2
EPDFNamedDest_SetDest 0 1 2 1
EPDFNumberFormat_GetConversion 0 1 1
EPDFNumberFormat_GetFixedDenominator 0 1 1
EPDFNumberFormat_GetFraction 0 1 1
EPDFNumberFormat_GetLabelPosition 0 1 1
EPDFNumberFormat_GetPrecision 0 1 1
EPDFNumberFormat_GetText 3 1 3 6 3
EPDFNumberFormat_GetUnit 3 1 6 3
EPDFNumberFormat_SetConversion 0 1 5
EPDFNumberFormat_SetFixedDenominator 0 1 0
EPDFNumberFormat_SetFraction 0 1 3
EPDFNumberFormat_SetLabelPosition 0 1 3
EPDFNumberFormat_SetPrecision 0 1 3
EPDFNumberFormat_SetText 0 1 3 1
EPDFNumberFormat_SetUnit 0 1 1
EPDFObjectDiff_Close - 1
EPDFObjectDiff_GetCount 3 1
EPDFObjectDiff_GetEntry 0 1 3 1 1 1 1 1 1
EPDFObjectDiff_GetReadStatus 3 1 3 3
EPDFObjectDiff_GetReferrer 3 1 3 3 3 1 4 3
EPDFObjectDiff_GetReferrerCount 3 1 3 3
EPDFObjectDiff_GetRevisionHealth 0 1 3 1 1 1
EPDFObjectDiff_GetValue 3 1 3 3 4 3 1
EPDFOutline_CreateItem 3 1 3 3 3 1
EPDFOutline_DeleteItem 0 1 3
EPDFOutline_ExportItemRawToOwnedBuffer 1 1 3 1
EPDFOutline_GetItem 1 1 3
EPDFOutline_GetObjectNumber 3 1
EPDFOutline_ImportItemRaw 0 1 1 3
EPDFOutline_MoveItem 0 1 3 3 3
EPDFOutline_SetAction 0 1 3 1
EPDFOutline_SetColor 0 1 3 0 5 5 5
EPDFOutline_SetOpen 0 1 3 0
EPDFOutline_SetStyle 0 1 3 3
EPDFOutline_SetTitle 0 1 3 1
EPDFPage_AddViewport 1 1 1
EPDFPage_AddViewportRaw 1 1 3 1
EPDFPage_ApplyRedactions 0 1 1 3 1
EPDFPage_ContinueLoad 3 1 3
EPDFPage_CountViewports 3 1
EPDFPage_CountViewportsRaw 3 1 3
EPDFPage_CreateAnnot 1 1 3
EPDFPage_CreateAnnotRaw 1 1 3 3 3
EPDFPage_ExportAnnotationsAsDocument 1 1 1 3
EPDFPage_ExportAnnotsRawToOwnedBuffer 1 1 3 1 3 1
EPDFPage_ExportRawToOwnedBuffer 1 1 3 1
EPDFPage_FindViewport 3 1 1
EPDFPage_Flatten 3 1 3
EPDFPage_FlattenAnnotations 3 1 1 3 3 1
EPDFPage_GetAnnotByName 1 1 1
EPDFPage_GetAnnotByObjectNumber 1 1 3
EPDFPage_GetAnnotCountRaw 3 1 3
EPDFPage_GetAnnotIndexByNameRaw 3 1 3 1
EPDFPage_GetAnnotIndexByObjectNumberRaw 3 1 3 3
EPDFPage_GetAnnotRaw 1 1 3 3
EPDFPage_GetObjectNumber 3 1
EPDFPage_GetParsedSize 0 1 1
EPDFPage_GetViewport 1 1 3
EPDFPage_GetViewportRaw 1 1 3 3
EPDFPage_ImportAnnotsRaw 0 1 3 1 3
EPDFPage_ImportRaw 0 1 1 3
EPDFPage_InsertBlankRaw 0 1 3 8 8 3
EPDFPage_IsContentCurrent 0 1
EPDFPage_IsValid 0 1
EPDFPage_MoveAnnots 0 1 1 3 3
EPDFPage_MoveAnnotsRaw 0 1 3 1 3 3
EPDFPage_PromoteInlineAnnotsRaw 3 1 3
EPDFPage_RemoveAnnot 0 1 3
EPDFPage_RemoveAnnotByName 0 1 1
EPDFPage_RemoveAnnotByObjectNumber 0 1 3
EPDFPage_RemoveAnnotRaw 0 1 3 3
EPDFPage_RemoveViewport 0 1 3
EPDFPage_RemoveViewportRaw 0 1 3 3
EPDFPage_ResetRenderCache 0 1
EPDFSig_CloseModel - 1
EPDFSig_Count 3 1
EPDFSig_DigestByteRange 0 1 1 3 4 1
EPDFSig_DigestFileRange 0 1 1 3 4 1
EPDFSig_GetByteRange 0 1 3 1
EPDFSig_GetContents 3 1 3 1 3
EPDFSig_GetCoverage 3 1 3
EPDFSig_GetDocMDPPermission 3 1 3
EPDFSig_GetFieldMDPAction 3 1 3
EPDFSig_GetFieldName 3 1 3 6 3
EPDFSig_GetFieldNameAt 3 1 3 3 3 6 3
EPDFSig_GetFieldNameCount 3 1 3 3
EPDFSig_GetFieldObjNum 3 1 3
EPDFSig_GetIndexByFieldObjNum 3 1 3
EPDFSig_GetKind 3 1 3
EPDFSig_GetLockAction 3 1 3
EPDFSig_GetLockPermission 3 1 3
EPDFSig_GetRevisionIndex 3 1 3
EPDFSig_GetSeedValueFilter 3 1 3 6 3
EPDFSig_GetSeedValueListAt 3 1 3 3 3 6 3
EPDFSig_GetSeedValueListCount 3 1 3 3
EPDFSig_GetSeedValueMDP 3 1 3
EPDFSig_GetSeedValuePresentFlags 3 1 3
EPDFSig_GetSeedValueRequiredFlags 3 1 3
EPDFSig_GetSeedValueVersion 3 1 3
EPDFSig_GetString 3 1 3 3 6 3
EPDFSig_GetValueObjNum 3 1 3
EPDFSig_GetWidgetObjNum 3 1 3
EPDFSig_GetWidgetPageObjNum 3 1 3
EPDFSig_HasSeedValue 0 1 3
EPDFSig_IsCatalogCertification 0 1 3
EPDFSig_IsRevisionChainValid 0 1
EPDFSig_IsSigned 0 1 3
EPDFSig_LoadModel 1 1
EPDFSig_Prepare 3 1 3 1
EPDFSig_SaveCandidate 0 1 3 1 1 1 1
EPDFSig_SaveCandidateToOwnedBuffer 1 1 3 1 1 1
EPDFSig_Seal 0 4 7 7 7 3 1 1 1 4 1
EPDFSig_SealSpan 0 4 7 7 7 1 1 1
EPDFSig_SetFieldLock 0 1 3 3 6 3 3
EPDFSig_WriteContents 0 4 7 7 7 4 3
EPDFText_GetCharGeometry 0 1 3 1
EPDFText_GetCharToTextMap 3 1 1 3
EPDFText_GetPageGeometry 3 1 3 3 1
EPDFText_GetTextFull 3 1 1 3
EPDFText_RedactInQuads 0 1 1 3 0 0
EPDFText_RedactInRect 0 1 1 0 0
EPDFViewport_AddMeasure 1 1
EPDFViewport_Close - 1
EPDFViewport_GetBBox 0 1 1
EPDFViewport_GetMeasure 1 1
EPDFViewport_GetName 3 1 6 3
EPDFViewport_RemoveMeasure 0 1
EPDFViewport_SetBBox 0 1 1
EPDFViewport_SetName 0 1 1
FORM_CanRedo 0 1 1
FORM_CanUndo 0 1 1
FORM_DoDocumentAAction - 1 3
FORM_DoDocumentJSAction - 1
FORM_DoDocumentOpenAction - 1
FORM_DoPageAAction - 1 1 3
FORM_ForceToKillFocus 0 1
FORM_GetFocusedAnnot 0 1 1 1
FORM_GetFocusedText 3 1 1 1 3
FORM_GetSelectedText 3 1 1 1 3
FORM_GetTextDirection 3 1 1
FORM_IsIndexSelected 0 1 1 3
FORM_OnAfterLoadPage - 1 1
FORM_OnBeforeClosePage - 1 1
FORM_OnChar 0 1 1 3 3
FORM_OnFocus 0 1 1 3 8 8
FORM_OnKeyDown 0 1 1 3 3
FORM_OnKeyUp 0 1 1 3 3
FORM_OnLButtonDoubleClick 0 1 1 3 8 8
FORM_OnLButtonDown 0 1 1 3 8 8
FORM_OnLButtonUp 0 1 1 3 8 8
FORM_OnMouseMove 0 1 1 3 8 8
FORM_OnMouseWheel 0 1 1 3 1 3 3
FORM_OnRButtonDown 0 1 1 3 8 8
FORM_OnRButtonUp 0 1 1 3 8 8
FORM_Redo 0 1 1
FORM_ReplaceAndKeepSelection - 1 1 1
FORM_ReplaceSelection - 1 1 1
FORM_SelectAllText 0 1 1
FORM_SetFocusedAnnot 0 1 1
FORM_SetIndexSelected 0 1 1 3 0
FORM_SetTextDirection 0 1 1 3
FORM_Undo 0 1 1
FPDF_AddInstalledFont - 1 4 3
FPDF_CloseDocument - 1
FPDF_ClosePage - 1
FPDF_CloseXObject - 1
FPDF_CopyViewerPreferences 0 1 1
FPDF_CountNamedDests 3 1
FPDF_CreateClipPath 1 5 5 5 5
FPDF_CreateNewDocument 1
FPDF_DestroyClipPath - 1
FPDF_DestroyLibrary -
FPDF_DeviceToPage 0 1 3 3 3 3 3 3 3 1 1
FPDF_DocumentHasValidCrossReferenceTable 0 1
FPDF_FFLDraw - 1 1 1 3 3 3 3 3 3
FPDF_FreeDefaultSystemFontInfo - 1
FPDF_GetDefaultSystemFontInfo 1
FPDF_GetDefaultTTFMap 1
FPDF_GetDefaultTTFMapCount 3
FPDF_GetDefaultTTFMapEntry 1 3
FPDF_GetDocPermissions 3 1
FPDF_GetDocUserPermissions 3 1
FPDF_GetFileIdentifier 3 1 3 1 3
FPDF_GetFileVersion 0 1 1
FPDF_GetFormType 3 1
FPDF_GetLastError 3
FPDF_GetMetaText 3 1 2 1 3
FPDF_GetNamedDest 1 1 3 1 1
FPDF_GetNamedDestByName 1 1 2
FPDF_GetPageAAction 1 1 3
FPDF_GetPageBoundingBox 0 1 1
FPDF_GetPageCount 3 1
FPDF_GetPageHeight 8 1
FPDF_GetPageHeightF 5 1
FPDF_GetPageLabel 3 1 3 1 3
FPDF_GetPageSizeByIndex 3 1 3 1 1
FPDF_GetPageSizeByIndexF 0 1 3 1
FPDF_GetPageWidth 8 1
FPDF_GetPageWidthF 5 1
FPDF_GetSecurityHandlerRevision 3 1
FPDF_GetSignatureCount 3 1
FPDF_GetSignatureObject 1 1 3
FPDF_GetTrailerEnds 3 1 1 3
FPDF_GetXFAPacketContent 0 1 3 1 3 1
FPDF_GetXFAPacketCount 3 1
FPDF_GetXFAPacketName 3 1 3 1 3
FPDF_ImportNPagesToOne 1 1 5 5 3 3
FPDF_ImportPages 0 1 1 2 3
FPDF_ImportPagesByIndex 0 1 1 1 3 3
FPDF_InitLibrary -
FPDF_InitLibraryWithConfig - 1
FPDF_LoadCustomDocument 1 1 2
FPDF_LoadDocument 1 4 2
FPDF_LoadMemDocument 1 1 3 2
FPDF_LoadMemDocument64 1 1 3 2
FPDF_LoadPage 1 1 3
FPDF_LoadXFA 0 1
FPDF_MovePages 0 1 1 3 3
FPDF_NewFormObjectFromXObject 1 1
FPDF_NewXObjectFromPage 1 1 1 3
FPDF_PageToDevice 0 1 3 3 3 3 3 8 8 1 1
FPDF_RemoveFormFieldHighlight - 1
FPDF_RenderPage_Close - 1
FPDF_RenderPage_Continue 3 1 1
FPDF_RenderPageBitmap - 1 1 3 3 3 3 3 3
FPDF_RenderPageBitmap_Start 3 1 1 3 3 3 3 3 3 1
FPDF_RenderPageBitmapWithColorScheme_Start 3 1 1 3 3 3 3 3 3 1 1
FPDF_RenderPageBitmapWithMatrix - 1 1 1 1 3
FPDF_SaveAsCopy 0 1 1 3
FPDF_SaveWithVersion 0 1 1 3 3
FPDF_SetFormFieldHighlightAlpha - 1 3
FPDF_SetFormFieldHighlightColor - 1 3 3
FPDF_SetSandBoxPolicy - 3 0
FPDF_SetSystemFontInfo - 1
FPDF_StructElement_Attr_CountChildren 3 1
FPDF_StructElement_Attr_GetBlobValue 0 1 1 3 1
FPDF_StructElement_Attr_GetBooleanValue 0 1 1
FPDF_StructElement_Attr_GetChildAtIndex 1 1 3
FPDF_StructElement_Attr_GetCount 3 1
FPDF_StructElement_Attr_GetName 0 1 3 1 3 1
FPDF_StructElement_Attr_GetNumberValue 0 1 1
FPDF_StructElement_Attr_GetStringValue 0 1 1 3 1
FPDF_StructElement_Attr_GetType 3 1
FPDF_StructElement_Attr_GetValue 1 1 2
FPDF_StructElement_CountChildren 3 1
FPDF_StructElement_GetActualText 3 1 1 3
FPDF_StructElement_GetAltText 3 1 1 3
FPDF_StructElement_GetAttributeAtIndex 1 1 3
FPDF_StructElement_GetAttributeCount 3 1
FPDF_StructElement_GetChildAtIndex 1 1 3
FPDF_StructElement_GetChildMarkedContentID 3 1 3
FPDF_StructElement_GetExpansion 3 1 1 3
FPDF_StructElement_GetID 3 1 1 3
FPDF_StructElement_GetLang 3 1 1 3
FPDF_StructElement_GetMarkedContentID 3 1
FPDF_StructElement_GetMarkedContentIdAtIndex 3 1 3
FPDF_StructElement_GetMarkedContentIdCount 3 1
FPDF_StructElement_GetObjType 3 1 1 3
FPDF_StructElement_GetParent 1 1
FPDF_StructElement_GetRawType 3 1 6 3
FPDF_StructElement_GetStringAttribute 3 1 2 1 3
FPDF_StructElement_GetTitle 3 1 1 3
FPDF_StructElement_GetType 3 1 1 3
FPDF_StructTree_Close - 1
FPDF_StructTree_CountChildren 3 1
FPDF_StructTree_GetChildAtIndex 1 1 3
FPDF_StructTree_GetForPage 1 1
FPDF_VIEWERREF_GetDuplex 3 1
FPDF_VIEWERREF_GetName 3 1 2 4 3
FPDF_VIEWERREF_GetNumCopies 3 1
FPDF_VIEWERREF_GetPrintPageRange 1 1
FPDF_VIEWERREF_GetPrintPageRangeCount 3 1
FPDF_VIEWERREF_GetPrintPageRangeElement 3 1 3
FPDF_VIEWERREF_GetPrintScaling 0 1
FPDFAction_GetDest 1 1 1
FPDFAction_GetFilePath 3 1 1 3
FPDFAction_GetType 3 1
FPDFAction_GetURIPath 3 1 1 1 3
FPDFAnnot_AddFileAttachment 1 1 1
FPDFAnnot_AddInkStroke 3 1 1 3
FPDFAnnot_AppendAttachmentPoints 0 1 1
FPDFAnnot_AppendObject 0 1 1
FPDFAnnot_CountAttachmentPoints 3 1
FPDFAnnot_GetAP 3 1 3 6 3
FPDFAnnot_GetAttachmentPoints 0 1 3 1
FPDFAnnot_GetBorder 0 1 1 1 1
FPDFAnnot_GetColor 0 1 3 1 1 1 1
FPDFAnnot_GetFileAttachment 1 1
FPDFAnnot_GetFlags 3 1
FPDFAnnot_GetFocusableSubtypes 0 1 1 3
FPDFAnnot_GetFocusableSubtypesCount 3 1
FPDFAnnot_GetFontColor 0 1 1 1 1 1
FPDFAnnot_GetFontSize 0 1 1 1
FPDFAnnot_GetFormAdditionalActionJavaScript 3 1 1 3 6 3
FPDFAnnot_GetFormControlCount 3 1 1
FPDFAnnot_GetFormControlIndex 3 1 1
FPDFAnnot_GetFormFieldAlternateName 3 1 1 6 3
FPDFAnnot_GetFormFieldAtPoint 1 1 1 1
FPDFAnnot_GetFormFieldExportValue 3 1 1 6 3
FPDFAnnot_GetFormFieldFlags 3 1 1
FPDFAnnot_GetFormFieldName 3 1 1 6 3
FPDFAnnot_GetFormFieldType 3 1 1
FPDFAnnot_GetFormFieldValue 3 1 1 6 3
FPDFAnnot_GetInkListCount 3 1
FPDFAnnot_GetInkListPath 3 1 3 1 3
FPDFAnnot_GetLine 0 1 1 1
FPDFAnnot_GetLink 1 1
FPDFAnnot_GetLinkedAnnot 1 1 2
FPDFAnnot_GetNumberValue 0 1 2 1
FPDFAnnot_GetObject 1 1 3
FPDFAnnot_GetObjectCount 3 1
FPDFAnnot_GetOptionCount 3 1 1
FPDFAnnot_GetOptionLabel 3 1 1 3 6 3
FPDFAnnot_GetRect 0 1 1
FPDFAnnot_GetStringValue 3 1 2 6 3
FPDFAnnot_GetSubtype 3 1
FPDFAnnot_GetValueType 3 1 2
FPDFAnnot_GetVertices 3 1 1 3
FPDFAnnot_HasAttachmentPoints 0 1
FPDFAnnot_HasKey 0 1 2
FPDFAnnot_IsChecked 0 1 1
FPDFAnnot_IsObjectSupportedSubtype 0 3
FPDFAnnot_IsOptionSelected 0 1 1 3
FPDFAnnot_IsSupportedSubtype 0 3
FPDFAnnot_RemoveInkList 0 1
FPDFAnnot_RemoveObject 0 1 3
FPDFAnnot_SetAP 0 1 3 1
FPDFAnnot_SetAttachmentPoints 0 1 3 1
FPDFAnnot_SetBorder 0 1 5 5 5
FPDFAnnot_SetColor 0 1 3 3 3 3 3
FPDFAnnot_SetFlags 0 1 3
FPDFAnnot_SetFocusableSubtypes 0 1 1 3
FPDFAnnot_SetFontColor 0 1 1 3 3 3
FPDFAnnot_SetFormFieldFlags 0 1 1 3
FPDFAnnot_SetRect 0 1 1
FPDFAnnot_SetStringValue 0 1 2 1
FPDFAnnot_SetURI 0 1 4
FPDFAnnot_UpdateObject 0 1 1
FPDFAttachment_GetAFRelationship 3 1 6 3
FPDFAttachment_GetDescription 3 1 6 3
FPDFAttachment_GetFile 0 1 1 3 1
FPDFAttachment_GetName 3 1 6 3
FPDFAttachment_GetStringValue 3 1 2 6 3
FPDFAttachment_GetSubtype 3 1 6 3
FPDFAttachment_GetValueType 3 1 2
FPDFAttachment_HasKey 0 1 2
FPDFAttachment_SetDescription 0 1 1
FPDFAttachment_SetFile 0 1 1 1 3
FPDFAttachment_SetStringValue 0 1 2 1
FPDFAvail_Create 1 1 1
FPDFAvail_Destroy - 1
FPDFAvail_GetDocument 1 1 2
FPDFAvail_GetFirstPageNum 3 1
FPDFAvail_IsDocAvail 3 1 1
FPDFAvail_IsFormAvail 3 1 1
FPDFAvail_IsLinearized 3 1
FPDFAvail_IsPageAvail 3 1 3 1
FPDFBitmap_Create 1 3 3 3
FPDFBitmap_CreateEx 1 3 3 3 1 3
FPDFBitmap_Destroy - 1
FPDFBitmap_FillRect 0 1 3 3 3 3 3
FPDFBitmap_GetBuffer 1 1
FPDFBitmap_GetFormat 3 1
FPDFBitmap_GetHeight 3 1
FPDFBitmap_GetStride 3 1
FPDFBitmap_GetWidth 3 1
FPDFBookmark_Find 1 1 1
FPDFBookmark_GetAction 1 1
FPDFBookmark_GetColor 0 1 1 1 1
FPDFBookmark_GetCount 3 1
FPDFBookmark_GetDest 1 1 1
FPDFBookmark_GetFirstChild 1 1 1
FPDFBookmark_GetNextSibling 1 1 1
FPDFBookmark_GetStyle 3 1
FPDFBookmark_GetTitle 3 1 1 3
FPDFCatalog_GetLanguage 3 1 6 3
FPDFCatalog_IsTagged 0 1
FPDFCatalog_SetLanguage 0 1 1
FPDFClipPath_CountPaths 3 1
FPDFClipPath_CountPathSegments 3 1 3
FPDFClipPath_GetPathSegment 1 1 3 3
FPDFDest_GetDestPageIndex 3 1 1
FPDFDest_GetLocationInPage 0 1 1 1 1 1 1 1
FPDFDest_GetView 3 1 1 1
FPDFDoc_AddAttachment 1 1 1
FPDFDoc_CloseJavaScriptAction - 1
FPDFDoc_DeleteAttachment 0 1 3
FPDFDOC_ExitFormFillEnvironment - 1
FPDFDoc_GetAttachment 1 1 3
FPDFDoc_GetAttachmentCount 3 1
FPDFDoc_GetJavaScriptAction 1 1 3
FPDFDoc_GetJavaScriptActionCount 3 1
FPDFDoc_GetPageMode 3 1
FPDFDOC_InitFormFillEnvironment 1 1 1
FPDFFont_Close - 1
FPDFFont_GetAscent 0 1 5 1
FPDFFont_GetBaseFontName 3 1 4 3
FPDFFont_GetDescent 0 1 5 1
FPDFFont_GetFamilyName 3 1 4 3
FPDFFont_GetFlags 3 1
FPDFFont_GetFontData 0 1 4 3 1
FPDFFont_GetGlyphPath 1 1 3 5
FPDFFont_GetGlyphWidth 0 1 3 5 1
FPDFFont_GetIsEmbedded 3 1
FPDFFont_GetItalicAngle 0 1 1
FPDFFont_GetWeight 3 1
FPDFFormObj_CountObjects 3 1
FPDFFormObj_GetObject 1 1 3
FPDFFormObj_RemoveObject 0 1 1
FPDFGlyphPath_CountGlyphSegments 3 1
FPDFGlyphPath_GetGlyphPathSegment 1 1 3
FPDFImageObj_GetBitmap 1 1
FPDFImageObj_GetIccProfileDataDecoded 0 1 1 4 3 1
FPDFImageObj_GetImageDataDecoded 3 1 1 3
FPDFImageObj_GetImageDataRaw 3 1 1 3
FPDFImageObj_GetImageFilter 3 1 3 1 3
FPDFImageObj_GetImageFilterCount 3 1
FPDFImageObj_GetImageMetadata 0 1 1 1
FPDFImageObj_GetImagePixelSize 0 1 1 1
FPDFImageObj_GetRenderedBitmap 1 1 1 1
FPDFImageObj_LoadJpegFile 0 1 3 1 1
FPDFImageObj_LoadJpegFileInline 0 1 3 1 1
FPDFImageObj_SetBitmap 0 1 3 1 1
FPDFImageObj_SetMatrix 0 1 8 8 8 8 8 8
FPDFJavaScriptAction_GetName 3 1 6 3
FPDFJavaScriptAction_GetScript 3 1 6 3
FPDFLink_CloseWebLinks - 1
FPDFLink_CountQuadPoints 3 1
FPDFLink_CountRects 3 1 3
FPDFLink_CountWebLinks 3 1
FPDFLink_Enumerate 0 1 1 1
FPDFLink_GetAction 1 1
FPDFLink_GetAnnot 1 1 1
FPDFLink_GetAnnotRect 0 1 1
FPDFLink_GetDest 1 1 1
FPDFLink_GetLinkAtPoint 1 1 8 8
FPDFLink_GetLinkZOrderAtPoint 3 1 8 8
FPDFLink_GetQuadPoints 0 1 3 1
FPDFLink_GetRect 0 1 3 3 1 1 1 1
FPDFLink_GetTextRange 0 1 3 1 1
FPDFLink_GetURL 3 1 3 1 3
FPDFLink_LoadWebLinks 1 1
FPDFPage_CloseAnnot - 1
FPDFPage_CountObjects 3 1
FPDFPage_CreateAnnot 1 1 3
FPDFPage_Delete - 1 3
FPDFPage_Flatten 3 1 3
FPDFPage_FormFieldZOrderAtPoint 3 1 1 8 8
FPDFPage_GenerateContent 0 1
FPDFPage_GetAnnot 1 1 3
FPDFPage_GetAnnotCount 3 1
FPDFPage_GetAnnotIndex 3 1 1
FPDFPage_GetArtBox 0 1 1 1 1 1
FPDFPage_GetBleedBox 0 1 1 1 1 1
FPDFPage_GetCropBox 0 1 1 1 1 1
FPDFPage_GetDecodedThumbnailData 3 1 1 3
FPDFPage_GetMediaBox 0 1 1 1 1 1
FPDFPage_GetObject 1 1 3
FPDFPage_GetRawThumbnailData 3 1 1 3
FPDFPage_GetRotation 3 1
FPDFPage_GetThumbnailAsBitmap 1 1
FPDFPage_GetTrimBox 0 1 1 1 1 1
FPDFPage_HasFormFieldAtPoint 3 1 1 8 8
FPDFPage_HasTransparency 0 1
FPDFPage_InsertClipPath - 1 1
FPDFPage_InsertObject 0 1 1
FPDFPage_InsertObjectAtIndex 0 1 1 3
FPDFPage_New 1 1 3 8 8
FPDFPage_RemoveAnnot 0 1 3
FPDFPage_RemoveObject 0 1 1
FPDFPage_SetArtBox - 1 5 5 5 5
FPDFPage_SetBleedBox - 1 5 5 5 5
FPDFPage_SetCropBox - 1 5 5 5 5
FPDFPage_SetMediaBox - 1 5 5 5 5
FPDFPage_SetRotation - 1 3
FPDFPage_SetTrimBox - 1 5 5 5 5
FPDFPage_TransformAnnots - 1 8 8 8 8 8 8
FPDFPage_TransFormWithClip 0 1 1 1
FPDFPageObj_AddExistingMark 0 1 1
FPDFPageObj_AddMark 1 1 2
FPDFPageObj_CountMarks 3 1
FPDFPageObj_CreateNewPath 1 5 5
FPDFPageObj_CreateNewRect 1 5 5 5 5
FPDFPageObj_CreateTextObj 1 1 1 5
FPDFPageObj_Destroy - 1
FPDFPageObj_GetBounds 0 1 1 1 1 1
FPDFPageObj_GetClipPath 1 1
FPDFPageObj_GetDashArray 0 1 1 3
FPDFPageObj_GetDashCount 3 1
FPDFPageObj_GetDashPhase 0 1 1
FPDFPageObj_GetFillColor 0 1 1 1 1 1
FPDFPageObj_GetIsActive 0 1 1
FPDFPageObj_GetLineCap 3 1
FPDFPageObj_GetLineJoin 3 1
FPDFPageObj_GetMark 1 1 3
FPDFPageObj_GetMarkedContentID 3 1
FPDFPageObj_GetMatrix 0 1 1
FPDFPageObj_GetRenderedFillPattern 1 1 1
FPDFPageObj_GetRenderedStrokePattern 1 1 1
FPDFPageObj_GetRotatedBounds 0 1 1
FPDFPageObj_GetStrokeColor 0 1 1 1 1 1
FPDFPageObj_GetStrokeWidth 0 1 1
FPDFPageObj_GetType 3 1
FPDFPageObj_HasTransparency 0 1
FPDFPageObj_NewImageObj 1 1
FPDFPageObj_NewTextObj 1 1 2 5
FPDFPageObj_RemoveMark 0 1 1
FPDFPageObj_SetBlendMode - 1 2
FPDFPageObj_SetDashArray 0 1 1 3 5
FPDFPageObj_SetDashPhase 0 1 5
FPDFPageObj_SetFillColor 0 1 3 3 3 3
FPDFPageObj_SetIsActive 0 1 0
FPDFPageObj_SetLineCap 0 1 3
FPDFPageObj_SetLineJoin 0 1 3
FPDFPageObj_SetMatrix 0 1 1
FPDFPageObj_SetStrokeColor 0 1 3 3 3 3
FPDFPageObj_SetStrokeWidth 0 1 5
FPDFPageObj_Transform - 1 8 8 8 8 8 8
FPDFPageObj_TransformClipPath - 1 8 8 8 8 8 8
FPDFPageObj_TransformF 0 1 1
FPDFPageObjMark_CountParams 3 1
FPDFPageObjMark_GetName 0 1 6 3 1
FPDFPageObjMark_GetParamBlobValue 0 1 2 4 3 1
FPDFPageObjMark_GetParamFloatValue 0 1 2 1
FPDFPageObjMark_GetParamIntValue 0 1 2 1
FPDFPageObjMark_GetParamKey 0 1 3 6 3 1
FPDFPageObjMark_GetParamStringValue 0 1 2 6 3 1
FPDFPageObjMark_GetParamValueType 3 1 2
FPDFPageObjMark_RemoveParam 0 1 1 2
FPDFPageObjMark_SetBlobParam 0 1 1 1 2 4 3
FPDFPageObjMark_SetFloatParam 0 1 1 1 2 5
FPDFPageObjMark_SetIntParam 0 1 1 1 2 3
FPDFPageObjMark_SetStringParam 0 1 1 1 2 2
FPDFPath_BezierTo 0 1 5 5 5 5 5 5
FPDFPath_Close 0 1
FPDFPath_CountSegments 3 1
FPDFPath_GetBezierControlPoints 0 1 3 1 1
FPDFPath_GetDrawMode 0 1 1 1
FPDFPath_GetPathSegment 1 1 3
FPDFPath_LineTo 0 1 5 5
FPDFPath_MoveTo 0 1 5 5
FPDFPath_SetDrawMode 0 1 3 0
FPDFPathSegment_GetClose 0 1
FPDFPathSegment_GetPoint 0 1 1 1
FPDFPathSegment_GetType 3 1
FPDFSignatureObj_GetByteRange 3 1 1 3
FPDFSignatureObj_GetContents 3 1 1 3
FPDFSignatureObj_GetDocMDPPermission 3 1
FPDFSignatureObj_GetReason 3 1 1 3
FPDFSignatureObj_GetSubFilter 3 1 4 3
FPDFSignatureObj_GetTime 3 1 4 3
FPDFText_ClosePage - 1
FPDFText_CountChars 3 1
FPDFText_CountRects 3 1 3 3
FPDFText_FindClose - 1
FPDFText_FindNext 0 1
FPDFText_FindPrev 0 1
FPDFText_FindStart 1 1 1 3 3
FPDFText_GetBoundedText 3 1 8 8 8 8 1 3
FPDFText_GetCharAngle 5 1 3
FPDFText_GetCharBox 0 1 3 1 1 1 1
FPDFText_GetCharIndexAtPos 3 1 8 8 8 8
FPDFText_GetCharIndexFromTextIndex 3 1 3
FPDFText_GetCharOrigin 0 1 3 1 1
FPDFText_GetFillColor 0 1 3 1 1 1 1
FPDFText_GetFontInfo 3 1 3 1 3 1
FPDFText_GetFontSize 8 1 3
FPDFText_GetFontWeight 3 1 3
FPDFText_GetLooseCharBox 0 1 3 1
FPDFText_GetMatrix 0 1 3 1
FPDFText_GetRect 0 1 3 1 1 1 1
FPDFText_GetSchCount 3 1
FPDFText_GetSchResultIndex 3 1
FPDFText_GetStrokeColor 0 1 3 1 1 1 1
FPDFText_GetText 3 1 3 3 1
FPDFText_GetTextIndexFromCharIndex 3 1 3
FPDFText_GetTextObject 1 1 3
FPDFText_GetUnicode 3 1 3
FPDFText_HasUnicodeMapError 3 1 3
FPDFText_IsGenerated 3 1 3
FPDFText_IsHyphen 3 1 3
FPDFText_LoadCidType2Font 1 1 4 3 2 4 3
FPDFText_LoadFont 1 1 4 3 3 0
FPDFText_LoadPage 1 1
FPDFText_LoadStandardFont 1 1 2
FPDFText_SetCharcodes 0 1 1 3
FPDFText_SetPositions 0 1 1 3
FPDFText_SetText 0 1 1
FPDFTextObj_GetFont 1 1
FPDFTextObj_GetFontSize 0 1 1
FPDFTextObj_GetRenderedBitmap 1 1 1 1 5
FPDFTextObj_GetText 3 1 1 6 3
FPDFTextObj_GetTextRenderMode 3 1
FPDFTextObj_SetFontSize 0 1 5
FPDFTextObj_SetTextRenderMode 0 1 3
`;

function decode(table: string): Readonly<Record<keyof PdfFunctions, PdfFunctionSignature>> {
  const out: Record<string, PdfFunctionSignature> = {};
  for (const row of table.split('\n')) {
    if (!row) continue;
    const [name, result, ...params] = row.split(' ');
    out[name!] = {
      params: params.map((index) => SLOTS[Number(index)]!),
      result: result === '-' ? null : SLOTS[Number(result)]!,
    };
  }
  return out as Readonly<Record<keyof PdfFunctions, PdfFunctionSignature>>;
}

export const pdfFunctionSignatures = decode(TABLE);
