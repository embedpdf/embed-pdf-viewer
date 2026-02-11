
var createPdfium = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  if (typeof __filename != 'undefined') _scriptName = _scriptName || __filename;
  return (
function(moduleArg = {}) {
  var moduleRtn;

// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = moduleArg;

// Set up the promise that indicates the Module is initialized
var readyPromiseResolve, readyPromiseReject;
var readyPromise = new Promise((resolve, reject) => {
  readyPromiseResolve = resolve;
  readyPromiseReject = reject;
});
["_EPDF_GetMetaKeyCount","_EPDF_GetMetaKeyName","_EPDF_GetMetaTrapped","_EPDF_GetPageRotationByIndex","_EPDF_GetPageSizeByIndexNormalized","_EPDF_HasMetaText","_EPDF_IsEncrypted","_EPDF_IsOwnerUnlocked","_EPDF_LoadPageNormalized","_EPDF_PNG_EncodeRGBA","_EPDF_RemoveEncryption","_EPDF_RenderAnnotBitmap","_EPDF_RenderAnnotBitmapUnrotated","_EPDF_SetEncryption","_EPDF_SetMetaText","_EPDF_SetMetaTrapped","_EPDF_UnlockOwnerPermissions","_EPDFAction_CreateGoTo","_EPDFAction_CreateGoToNamed","_EPDFAction_CreateLaunch","_EPDFAction_CreateRemoteGoToByName","_EPDFAction_CreateRemoteGoToDest","_EPDFAction_CreateURI","_EPDFAnnot_ApplyRedaction","_EPDFAnnot_ClearColor","_EPDFAnnot_Flatten","_EPDFAnnot_GenerateAppearance","_EPDFAnnot_GenerateAppearanceWithBlend","_EPDFAnnot_GetAPMatrix","_EPDFAnnot_GetBlendMode","_EPDFAnnot_GetBorderDashPattern","_EPDFAnnot_GetBorderDashPatternCount","_EPDFAnnot_GetBorderEffect","_EPDFAnnot_GetBorderStyle","_EPDFAnnot_GetColor","_EPDFAnnot_GetDefaultAppearance","_EPDFAnnot_GetExtendedRotation","_EPDFAnnot_GetIcon","_EPDFAnnot_GetIntent","_EPDFAnnot_GetLineEndings","_EPDFAnnot_GetOpacity","_EPDFAnnot_GetOverlayText","_EPDFAnnot_GetOverlayTextRepeat","_EPDFAnnot_GetRectangleDifferences","_EPDFAnnot_GetReplyType","_EPDFAnnot_GetRichContent","_EPDFAnnot_GetRotate","_EPDFAnnot_GetTextAlignment","_EPDFAnnot_GetUnrotatedRect","_EPDFAnnot_GetVerticalAlignment","_EPDFAnnot_SetAction","_EPDFAnnot_SetAPMatrix","_EPDFAnnot_SetBorderDashPattern","_EPDFAnnot_SetBorderStyle","_EPDFAnnot_SetColor","_EPDFAnnot_SetDefaultAppearance","_EPDFAnnot_SetExtendedRotation","_EPDFAnnot_SetIcon","_EPDFAnnot_SetIntent","_EPDFAnnot_SetLine","_EPDFAnnot_SetLineEndings","_EPDFAnnot_SetLinkedAnnot","_EPDFAnnot_SetOpacity","_EPDFAnnot_SetOverlayText","_EPDFAnnot_SetOverlayTextRepeat","_EPDFAnnot_SetReplyType","_EPDFAnnot_SetRotate","_EPDFAnnot_SetTextAlignment","_EPDFAnnot_SetUnrotatedRect","_EPDFAnnot_SetVerticalAlignment","_EPDFAnnot_SetVertices","_EPDFAnnot_UpdateAppearanceToRect","_EPDFAttachment_GetDescription","_EPDFAttachment_GetIntegerValue","_EPDFAttachment_SetDescription","_EPDFAttachment_SetSubtype","_EPDFBookmark_AppendChild","_EPDFBookmark_Clear","_EPDFBookmark_ClearTarget","_EPDFBookmark_Create","_EPDFBookmark_Delete","_EPDFBookmark_InsertAfter","_EPDFBookmark_SetAction","_EPDFBookmark_SetDest","_EPDFBookmark_SetTitle","_EPDFCatalog_GetLanguage","_EPDFDest_CreateRemoteView","_EPDFDest_CreateRemoteXYZ","_EPDFDest_CreateView","_EPDFDest_CreateXYZ","_EPDFNamedDest_Remove","_EPDFNamedDest_SetDest","_EPDFPage_ApplyRedactions","_EPDFPage_CreateAnnot","_EPDFPage_GetAnnotByName","_EPDFPage_GetAnnotCountRaw","_EPDFPage_GetAnnotRaw","_EPDFPage_RemoveAnnotByName","_EPDFPage_RemoveAnnotRaw","_EPDFText_RedactInQuads","_EPDFText_RedactInRect","_FORM_CanRedo","_FORM_CanUndo","_FORM_DoDocumentAAction","_FORM_DoDocumentJSAction","_FORM_DoDocumentOpenAction","_FORM_DoPageAAction","_FORM_ForceToKillFocus","_FORM_GetFocusedAnnot","_FORM_GetFocusedText","_FORM_GetSelectedText","_FORM_IsIndexSelected","_FORM_OnAfterLoadPage","_FORM_OnBeforeClosePage","_FORM_OnChar","_FORM_OnFocus","_FORM_OnKeyDown","_FORM_OnKeyUp","_FORM_OnLButtonDoubleClick","_FORM_OnLButtonDown","_FORM_OnLButtonUp","_FORM_OnMouseMove","_FORM_OnMouseWheel","_FORM_OnRButtonDown","_FORM_OnRButtonUp","_FORM_Redo","_FORM_ReplaceAndKeepSelection","_FORM_ReplaceSelection","_FORM_SelectAllText","_FORM_SetFocusedAnnot","_FORM_SetIndexSelected","_FORM_Undo","_FPDF_AddInstalledFont","_FPDF_CloseDocument","_FPDF_ClosePage","_FPDF_CloseXObject","_FPDF_CopyViewerPreferences","_FPDF_CountNamedDests","_FPDF_CreateClipPath","_FPDF_CreateNewDocument","_FPDF_DestroyClipPath","_FPDF_DestroyLibrary","_FPDF_DeviceToPage","_FPDF_DocumentHasValidCrossReferenceTable","_FPDF_FFLDraw","_FPDF_FreeDefaultSystemFontInfo","_FPDF_GetDefaultSystemFontInfo","_FPDF_GetDefaultTTFMap","_FPDF_GetDefaultTTFMapCount","_FPDF_GetDefaultTTFMapEntry","_FPDF_GetDocPermissions","_FPDF_GetDocUserPermissions","_FPDF_GetFileIdentifier","_FPDF_GetFileVersion","_FPDF_GetFormType","_FPDF_GetLastError","_FPDF_GetMetaText","_FPDF_GetNamedDest","_FPDF_GetNamedDestByName","_FPDF_GetPageAAction","_FPDF_GetPageBoundingBox","_FPDF_GetPageCount","_FPDF_GetPageHeight","_FPDF_GetPageHeightF","_FPDF_GetPageLabel","_FPDF_GetPageSizeByIndex","_FPDF_GetPageSizeByIndexF","_FPDF_GetPageWidth","_FPDF_GetPageWidthF","_FPDF_GetSecurityHandlerRevision","_FPDF_GetSignatureCount","_FPDF_GetSignatureObject","_FPDF_GetTrailerEnds","_FPDF_GetXFAPacketContent","_FPDF_GetXFAPacketCount","_FPDF_GetXFAPacketName","_FPDF_ImportNPagesToOne","_FPDF_ImportPages","_FPDF_ImportPagesByIndex","_FPDF_InitLibrary","_FPDF_InitLibraryWithConfig","_FPDF_LoadCustomDocument","_FPDF_LoadDocument","_FPDF_LoadMemDocument","_FPDF_LoadMemDocument64","_FPDF_LoadPage","_FPDF_LoadXFA","_FPDF_MovePages","_FPDF_NewFormObjectFromXObject","_FPDF_NewXObjectFromPage","_FPDF_PageToDevice","_FPDF_RemoveFormFieldHighlight","_FPDF_RenderPage_Close","_FPDF_RenderPage_Continue","_FPDF_RenderPageBitmap","_FPDF_RenderPageBitmap_Start","_FPDF_RenderPageBitmapWithColorScheme_Start","_FPDF_RenderPageBitmapWithMatrix","_FPDF_SaveAsCopy","_FPDF_SaveWithVersion","_FPDF_SetFormFieldHighlightAlpha","_FPDF_SetFormFieldHighlightColor","_FPDF_SetSandBoxPolicy","_FPDF_SetSystemFontInfo","_FPDF_StructElement_Attr_CountChildren","_FPDF_StructElement_Attr_GetBlobValue","_FPDF_StructElement_Attr_GetBooleanValue","_FPDF_StructElement_Attr_GetChildAtIndex","_FPDF_StructElement_Attr_GetCount","_FPDF_StructElement_Attr_GetName","_FPDF_StructElement_Attr_GetNumberValue","_FPDF_StructElement_Attr_GetStringValue","_FPDF_StructElement_Attr_GetType","_FPDF_StructElement_Attr_GetValue","_FPDF_StructElement_CountChildren","_FPDF_StructElement_GetActualText","_FPDF_StructElement_GetAltText","_FPDF_StructElement_GetAttributeAtIndex","_FPDF_StructElement_GetAttributeCount","_FPDF_StructElement_GetChildAtIndex","_FPDF_StructElement_GetChildMarkedContentID","_FPDF_StructElement_GetID","_FPDF_StructElement_GetLang","_FPDF_StructElement_GetMarkedContentID","_FPDF_StructElement_GetMarkedContentIdAtIndex","_FPDF_StructElement_GetMarkedContentIdCount","_FPDF_StructElement_GetObjType","_FPDF_StructElement_GetParent","_FPDF_StructElement_GetStringAttribute","_FPDF_StructElement_GetTitle","_FPDF_StructElement_GetType","_FPDF_StructTree_Close","_FPDF_StructTree_CountChildren","_FPDF_StructTree_GetChildAtIndex","_FPDF_StructTree_GetForPage","_FPDF_VIEWERREF_GetDuplex","_FPDF_VIEWERREF_GetName","_FPDF_VIEWERREF_GetNumCopies","_FPDF_VIEWERREF_GetPrintPageRange","_FPDF_VIEWERREF_GetPrintPageRangeCount","_FPDF_VIEWERREF_GetPrintPageRangeElement","_FPDF_VIEWERREF_GetPrintScaling","_FPDFAction_GetDest","_FPDFAction_GetFilePath","_FPDFAction_GetType","_FPDFAction_GetURIPath","_FPDFAnnot_AddFileAttachment","_FPDFAnnot_AddInkStroke","_FPDFAnnot_AppendAttachmentPoints","_FPDFAnnot_AppendObject","_FPDFAnnot_CountAttachmentPoints","_FPDFAnnot_GetAP","_FPDFAnnot_GetAttachmentPoints","_FPDFAnnot_GetBorder","_FPDFAnnot_GetColor","_FPDFAnnot_GetFileAttachment","_FPDFAnnot_GetFlags","_FPDFAnnot_GetFocusableSubtypes","_FPDFAnnot_GetFocusableSubtypesCount","_FPDFAnnot_GetFontColor","_FPDFAnnot_GetFontSize","_FPDFAnnot_GetFormAdditionalActionJavaScript","_FPDFAnnot_GetFormControlCount","_FPDFAnnot_GetFormControlIndex","_FPDFAnnot_GetFormFieldAlternateName","_FPDFAnnot_GetFormFieldAtPoint","_FPDFAnnot_GetFormFieldExportValue","_FPDFAnnot_GetFormFieldFlags","_FPDFAnnot_GetFormFieldName","_FPDFAnnot_GetFormFieldType","_FPDFAnnot_GetFormFieldValue","_FPDFAnnot_GetInkListCount","_FPDFAnnot_GetInkListPath","_FPDFAnnot_GetLine","_FPDFAnnot_GetLink","_FPDFAnnot_GetLinkedAnnot","_FPDFAnnot_GetNumberValue","_FPDFAnnot_GetObject","_FPDFAnnot_GetObjectCount","_FPDFAnnot_GetOptionCount","_FPDFAnnot_GetOptionLabel","_FPDFAnnot_GetRect","_FPDFAnnot_GetStringValue","_FPDFAnnot_GetSubtype","_FPDFAnnot_GetValueType","_FPDFAnnot_GetVertices","_FPDFAnnot_HasAttachmentPoints","_FPDFAnnot_HasKey","_FPDFAnnot_IsChecked","_FPDFAnnot_IsObjectSupportedSubtype","_FPDFAnnot_IsOptionSelected","_FPDFAnnot_IsSupportedSubtype","_FPDFAnnot_RemoveInkList","_FPDFAnnot_RemoveObject","_FPDFAnnot_SetAP","_FPDFAnnot_SetAttachmentPoints","_FPDFAnnot_SetBorder","_FPDFAnnot_SetColor","_FPDFAnnot_SetFlags","_FPDFAnnot_SetFocusableSubtypes","_FPDFAnnot_SetFontColor","_FPDFAnnot_SetFormFieldFlags","_FPDFAnnot_SetRect","_FPDFAnnot_SetStringValue","_FPDFAnnot_SetURI","_FPDFAnnot_UpdateObject","_FPDFAttachment_GetFile","_FPDFAttachment_GetName","_FPDFAttachment_GetStringValue","_FPDFAttachment_GetSubtype","_FPDFAttachment_GetValueType","_FPDFAttachment_HasKey","_FPDFAttachment_SetFile","_FPDFAttachment_SetStringValue","_FPDFAvail_Create","_FPDFAvail_Destroy","_FPDFAvail_GetDocument","_FPDFAvail_GetFirstPageNum","_FPDFAvail_IsDocAvail","_FPDFAvail_IsFormAvail","_FPDFAvail_IsLinearized","_FPDFAvail_IsPageAvail","_FPDFBitmap_Create","_FPDFBitmap_CreateEx","_FPDFBitmap_Destroy","_FPDFBitmap_FillRect","_FPDFBitmap_GetBuffer","_FPDFBitmap_GetFormat","_FPDFBitmap_GetHeight","_FPDFBitmap_GetStride","_FPDFBitmap_GetWidth","_FPDFBookmark_Find","_FPDFBookmark_GetAction","_FPDFBookmark_GetCount","_FPDFBookmark_GetDest","_FPDFBookmark_GetFirstChild","_FPDFBookmark_GetNextSibling","_FPDFBookmark_GetTitle","_FPDFCatalog_IsTagged","_FPDFCatalog_SetLanguage","_FPDFClipPath_CountPaths","_FPDFClipPath_CountPathSegments","_FPDFClipPath_GetPathSegment","_FPDFDest_GetDestPageIndex","_FPDFDest_GetLocationInPage","_FPDFDest_GetView","_FPDFDoc_AddAttachment","_FPDFDoc_CloseJavaScriptAction","_FPDFDoc_DeleteAttachment","_FPDFDOC_ExitFormFillEnvironment","_FPDFDoc_GetAttachment","_FPDFDoc_GetAttachmentCount","_FPDFDoc_GetJavaScriptAction","_FPDFDoc_GetJavaScriptActionCount","_FPDFDoc_GetPageMode","_FPDFDOC_InitFormFillEnvironment","_FPDFFont_Close","_FPDFFont_GetAscent","_FPDFFont_GetBaseFontName","_FPDFFont_GetDescent","_FPDFFont_GetFamilyName","_FPDFFont_GetFlags","_FPDFFont_GetFontData","_FPDFFont_GetGlyphPath","_FPDFFont_GetGlyphWidth","_FPDFFont_GetIsEmbedded","_FPDFFont_GetItalicAngle","_FPDFFont_GetWeight","_FPDFFormObj_CountObjects","_FPDFFormObj_GetObject","_FPDFFormObj_RemoveObject","_FPDFGlyphPath_CountGlyphSegments","_FPDFGlyphPath_GetGlyphPathSegment","_FPDFImageObj_GetBitmap","_FPDFImageObj_GetIccProfileDataDecoded","_FPDFImageObj_GetImageDataDecoded","_FPDFImageObj_GetImageDataRaw","_FPDFImageObj_GetImageFilter","_FPDFImageObj_GetImageFilterCount","_FPDFImageObj_GetImageMetadata","_FPDFImageObj_GetImagePixelSize","_FPDFImageObj_GetRenderedBitmap","_FPDFImageObj_LoadJpegFile","_FPDFImageObj_LoadJpegFileInline","_FPDFImageObj_SetBitmap","_FPDFImageObj_SetMatrix","_FPDFJavaScriptAction_GetName","_FPDFJavaScriptAction_GetScript","_FPDFLink_CloseWebLinks","_FPDFLink_CountQuadPoints","_FPDFLink_CountRects","_FPDFLink_CountWebLinks","_FPDFLink_Enumerate","_FPDFLink_GetAction","_FPDFLink_GetAnnot","_FPDFLink_GetAnnotRect","_FPDFLink_GetDest","_FPDFLink_GetLinkAtPoint","_FPDFLink_GetLinkZOrderAtPoint","_FPDFLink_GetQuadPoints","_FPDFLink_GetRect","_FPDFLink_GetTextRange","_FPDFLink_GetURL","_FPDFLink_LoadWebLinks","_FPDFPage_CloseAnnot","_FPDFPage_CountObjects","_FPDFPage_CreateAnnot","_FPDFPage_Delete","_FPDFPage_Flatten","_FPDFPage_FormFieldZOrderAtPoint","_FPDFPage_GenerateContent","_FPDFPage_GetAnnot","_FPDFPage_GetAnnotCount","_FPDFPage_GetAnnotIndex","_FPDFPage_GetArtBox","_FPDFPage_GetBleedBox","_FPDFPage_GetCropBox","_FPDFPage_GetDecodedThumbnailData","_FPDFPage_GetMediaBox","_FPDFPage_GetObject","_FPDFPage_GetRawThumbnailData","_FPDFPage_GetRotation","_FPDFPage_GetThumbnailAsBitmap","_FPDFPage_GetTrimBox","_FPDFPage_HasFormFieldAtPoint","_FPDFPage_HasTransparency","_FPDFPage_InsertClipPath","_FPDFPage_InsertObject","_FPDFPage_InsertObjectAtIndex","_FPDFPage_New","_FPDFPage_RemoveAnnot","_FPDFPage_RemoveObject","_FPDFPage_SetArtBox","_FPDFPage_SetBleedBox","_FPDFPage_SetCropBox","_FPDFPage_SetMediaBox","_FPDFPage_SetRotation","_FPDFPage_SetTrimBox","_FPDFPage_TransformAnnots","_FPDFPage_TransFormWithClip","_FPDFPageObj_AddMark","_FPDFPageObj_CountMarks","_FPDFPageObj_CreateNewPath","_FPDFPageObj_CreateNewRect","_FPDFPageObj_CreateTextObj","_FPDFPageObj_Destroy","_FPDFPageObj_GetBounds","_FPDFPageObj_GetClipPath","_FPDFPageObj_GetDashArray","_FPDFPageObj_GetDashCount","_FPDFPageObj_GetDashPhase","_FPDFPageObj_GetFillColor","_FPDFPageObj_GetIsActive","_FPDFPageObj_GetLineCap","_FPDFPageObj_GetLineJoin","_FPDFPageObj_GetMark","_FPDFPageObj_GetMarkedContentID","_FPDFPageObj_GetMatrix","_FPDFPageObj_GetRotatedBounds","_FPDFPageObj_GetStrokeColor","_FPDFPageObj_GetStrokeWidth","_FPDFPageObj_GetType","_FPDFPageObj_HasTransparency","_FPDFPageObj_NewImageObj","_FPDFPageObj_NewTextObj","_FPDFPageObj_RemoveMark","_FPDFPageObj_SetBlendMode","_FPDFPageObj_SetDashArray","_FPDFPageObj_SetDashPhase","_FPDFPageObj_SetFillColor","_FPDFPageObj_SetIsActive","_FPDFPageObj_SetLineCap","_FPDFPageObj_SetLineJoin","_FPDFPageObj_SetMatrix","_FPDFPageObj_SetStrokeColor","_FPDFPageObj_SetStrokeWidth","_FPDFPageObj_Transform","_FPDFPageObj_TransformClipPath","_FPDFPageObj_TransformF","_FPDFPageObjMark_CountParams","_FPDFPageObjMark_GetName","_FPDFPageObjMark_GetParamBlobValue","_FPDFPageObjMark_GetParamIntValue","_FPDFPageObjMark_GetParamKey","_FPDFPageObjMark_GetParamStringValue","_FPDFPageObjMark_GetParamValueType","_FPDFPageObjMark_RemoveParam","_FPDFPageObjMark_SetBlobParam","_FPDFPageObjMark_SetIntParam","_FPDFPageObjMark_SetStringParam","_FPDFPath_BezierTo","_FPDFPath_Close","_FPDFPath_CountSegments","_FPDFPath_GetDrawMode","_FPDFPath_GetPathSegment","_FPDFPath_LineTo","_FPDFPath_MoveTo","_FPDFPath_SetDrawMode","_FPDFPathSegment_GetClose","_FPDFPathSegment_GetPoint","_FPDFPathSegment_GetType","_FPDFSignatureObj_GetByteRange","_FPDFSignatureObj_GetContents","_FPDFSignatureObj_GetDocMDPPermission","_FPDFSignatureObj_GetReason","_FPDFSignatureObj_GetSubFilter","_FPDFSignatureObj_GetTime","_FPDFText_ClosePage","_FPDFText_CountChars","_FPDFText_CountRects","_FPDFText_FindClose","_FPDFText_FindNext","_FPDFText_FindPrev","_FPDFText_FindStart","_FPDFText_GetBoundedText","_FPDFText_GetCharAngle","_FPDFText_GetCharBox","_FPDFText_GetCharIndexAtPos","_FPDFText_GetCharIndexFromTextIndex","_FPDFText_GetCharOrigin","_FPDFText_GetFillColor","_FPDFText_GetFontInfo","_FPDFText_GetFontSize","_FPDFText_GetFontWeight","_FPDFText_GetLooseCharBox","_FPDFText_GetMatrix","_FPDFText_GetRect","_FPDFText_GetSchCount","_FPDFText_GetSchResultIndex","_FPDFText_GetStrokeColor","_FPDFText_GetText","_FPDFText_GetTextIndexFromCharIndex","_FPDFText_GetTextObject","_FPDFText_GetUnicode","_FPDFText_HasUnicodeMapError","_FPDFText_IsGenerated","_FPDFText_IsHyphen","_FPDFText_LoadCidType2Font","_FPDFText_LoadFont","_FPDFText_LoadPage","_FPDFText_LoadStandardFont","_FPDFText_SetCharcodes","_FPDFText_SetText","_FPDFTextObj_GetFont","_FPDFTextObj_GetFontSize","_FPDFTextObj_GetRenderedBitmap","_FPDFTextObj_GetText","_FPDFTextObj_GetTextRenderMode","_FPDFTextObj_SetTextRenderMode","_PDFiumExt_CloseFileWriter","_PDFiumExt_CloseFormFillInfo","_PDFiumExt_ExitFormFillEnvironment","_PDFiumExt_GetFileWriterData","_PDFiumExt_GetFileWriterSize","_PDFiumExt_Init","_PDFiumExt_InitFormFillEnvironment","_PDFiumExt_OpenFileWriter","_PDFiumExt_OpenFormFillInfo","_PDFiumExt_SaveAsCopy","_malloc","_free","_memory","___indirect_function_table","onRuntimeInitialized"].forEach((prop) => {
  if (!Object.getOwnPropertyDescriptor(readyPromise, prop)) {
    Object.defineProperty(readyPromise, prop, {
      get: () => abort('You are getting ' + prop + ' on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js'),
      set: () => abort('You are setting ' + prop + ' on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js'),
    });
  }
});

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == 'object';
var ENVIRONMENT_IS_WORKER = typeof importScripts == 'function';
// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == 'object' && typeof process.versions == 'object' && typeof process.versions.node == 'string' && process.type != 'renderer';
var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (ENVIRONMENT_IS_NODE) {
  // `require()` is no-op in an ESM module, use `createRequire()` to construct
  // the require()` function.  This is only necessary for multi-environment
  // builds, `-sENVIRONMENT=node` emits a static import declaration instead.
  // TODO: Swap all `require()`'s with `import()`'s?

}

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = Object.assign({}, Module);

var arguments_ = [];
var thisProgram = './this.program';
var quit_ = (status, toThrow) => {
  throw toThrow;
};

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  if (typeof process == 'undefined' || !process.release || process.release.name !== 'node') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  var nodeVersion = process.versions.node;
  var numericVersion = nodeVersion.split('.').slice(0, 3);
  numericVersion = (numericVersion[0] * 10000) + (numericVersion[1] * 100) + (numericVersion[2].split('-')[0] * 1);
  var minVersion = 160000;
  if (numericVersion < 160000) {
    throw new Error('This emscripten-generated code requires node v16.0.0 (detected v' + nodeVersion + ')');
  }

  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require('fs');
  var nodePath = require('path');

  scriptDirectory = __dirname + '/';

// include: node_shell_read.js
readBinary = (filename) => {
  // We need to re-wrap `file://` strings to URLs. Normalizing isn't
  // necessary in that case, the path should already be absolute.
  filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
  var ret = fs.readFileSync(filename);
  assert(ret.buffer);
  return ret;
};

readAsync = (filename, binary = true) => {
  // See the comment in the `readBinary` function.
  filename = isFileURI(filename) ? new URL(filename) : nodePath.normalize(filename);
  return new Promise((resolve, reject) => {
    fs.readFile(filename, binary ? undefined : 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(binary ? data.buffer : data);
    });
  });
};
// end include: node_shell_read.js
  if (!Module['thisProgram'] && process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, '/');
  }

  arguments_ = process.argv.slice(2);

  // MODULARIZE will export the module in the proper place outside, we don't need to export here

  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };

} else
if (ENVIRONMENT_IS_SHELL) {

  if ((typeof process == 'object' && typeof require === 'function') || typeof window == 'object' || typeof importScripts == 'function') throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  readBinary = (f) => {
    if (typeof readbuffer == 'function') {
      return new Uint8Array(readbuffer(f));
    }
    let data = read(f, 'binary');
    assert(typeof data == 'object');
    return data;
  };

  readAsync = (f) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(readBinary(f)));
    });
  };

  globalThis.clearTimeout ??= (id) => {};

  // spidermonkey lacks setTimeout but we use it above in readAsync.
  globalThis.setTimeout ??= (f) => (typeof f == 'function') ? f() : abort();

  // v8 uses `arguments_` whereas spidermonkey uses `scriptArgs`
  arguments_ = globalThis.arguments || globalThis.scriptArgs;

  if (typeof quit == 'function') {
    quit_ = (status, toThrow) => {
      // Unlike node which has process.exitCode, d8 has no such mechanism. So we
      // have no way to set the exit code and then let the program exit with
      // that code when it naturally stops running (say, when all setTimeouts
      // have completed). For that reason, we must call `quit` - the only way to
      // set the exit code - but quit also halts immediately.  To increase
      // consistency with node (and the web) we schedule the actual quit call
      // using a setTimeout to give the current stack and any exception handlers
      // a chance to run.  This enables features such as addOnPostRun (which
      // expected to be able to run code after main returns).
      setTimeout(() => {
        if (!(toThrow instanceof ExitStatus)) {
          let toLog = toThrow;
          if (toThrow && typeof toThrow == 'object' && toThrow.stack) {
            toLog = [toThrow, toThrow.stack];
          }
          err(`exiting due to exception: ${toLog}`);
        }
        quit(status);
      });
      throw toThrow;
    };
  }

  if (typeof print != 'undefined') {
    // Prefer to use print/printErr where they exist, as they usually work better.
    globalThis.console ??= /** @type{!Console} */({});
    console.log = /** @type{!function(this:Console, ...*): undefined} */ (print);
    console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */ (globalThis.printErr ?? print);
  }

} else

// Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (typeof document != 'undefined' && document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // When MODULARIZE, this JS may be executed later, after document.currentScript
  // is gone, so we saved it, and we use it here instead of any other info.
  if (_scriptName) {
    scriptDirectory = _scriptName;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
  // they are removed because they could contain a slash.
  if (scriptDirectory.startsWith('blob:')) {
    scriptDirectory = '';
  } else {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/')+1);
  }

  if (!(typeof window == 'object' || typeof importScripts == 'function')) throw new Error('not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)');

  {
// include: web_or_worker_shell_read.js
if (ENVIRONMENT_IS_WORKER) {
    readBinary = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.responseType = 'arraybuffer';
      xhr.send(null);
      return new Uint8Array(/** @type{!ArrayBuffer} */(xhr.response));
    };
  }

  readAsync = (url) => {
    assert(!isFileURI(url), "readAsync does not work with file:// URLs");
    return fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (response.ok) {
          return response.arrayBuffer();
        }
        return Promise.reject(new Error(response.status + ' : ' + response.url));
      })
  };
// end include: web_or_worker_shell_read.js
  }
} else
{
  throw new Error('environment detection error');
}

var out = Module['print'] || console.log.bind(console);
var err = Module['printErr'] || console.error.bind(console);

// Merge back in the overrides
Object.assign(Module, moduleOverrides);
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used.
moduleOverrides = null;
checkIncomingModuleAPI();

// Emit code to handle expected values on the Module object. This applies Module.x
// to the proper local x. This has two benefits: first, we only emit it if it is
// expected to arrive, and second, by using a local everywhere else that can be
// minified.

if (Module['arguments']) arguments_ = Module['arguments'];legacyModuleProp('arguments', 'arguments_');

if (Module['thisProgram']) thisProgram = Module['thisProgram'];legacyModuleProp('thisProgram', 'thisProgram');

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
// Assertions on removed incoming Module JS APIs.
assert(typeof Module['memoryInitializerPrefixURL'] == 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] == 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] == 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] == 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['read'] == 'undefined', 'Module.read option was removed');
assert(typeof Module['readAsync'] == 'undefined', 'Module.readAsync option was removed (modify readAsync in JS)');
assert(typeof Module['readBinary'] == 'undefined', 'Module.readBinary option was removed (modify readBinary in JS)');
assert(typeof Module['setWindowTitle'] == 'undefined', 'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)');
assert(typeof Module['TOTAL_MEMORY'] == 'undefined', 'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY');
legacyModuleProp('asm', 'wasmExports');
legacyModuleProp('readAsync', 'readAsync');
legacyModuleProp('readBinary', 'readBinary');
legacyModuleProp('setWindowTitle', 'setWindowTitle');
var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js';
var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js';
var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js';
var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js';
var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js';
var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js';
var OPFS = 'OPFS is no longer included by default; build with -lopfs.js';

var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js';

// end include: shell.js

// include: preamble.js
// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

var wasmBinary = Module['wasmBinary'];legacyModuleProp('wasmBinary', 'wasmBinary');

if (typeof WebAssembly != 'object') {
  err('no native wasm support detected');
}

// Wasm globals

var wasmMemory;

//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed' + (text ? ': ' + text : ''));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.

// Memory management

var HEAP,
/** @type {!Int8Array} */
  HEAP8,
/** @type {!Uint8Array} */
  HEAPU8,
/** @type {!Int16Array} */
  HEAP16,
/** @type {!Uint16Array} */
  HEAPU16,
/** @type {!Int32Array} */
  HEAP32,
/** @type {!Uint32Array} */
  HEAPU32,
/** @type {!Float32Array} */
  HEAPF32,
/** @type {!Float64Array} */
  HEAPF64;

// include: runtime_shared.js
function updateMemoryViews() {
  var b = wasmMemory.buffer;
  Module['HEAP8'] = HEAP8 = new Int8Array(b);
  Module['HEAP16'] = HEAP16 = new Int16Array(b);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(b);
  Module['HEAP32'] = HEAP32 = new Int32Array(b);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(b);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(b);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(b);
}

// end include: runtime_shared.js
assert(!Module['STACK_SIZE'], 'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time')

assert(typeof Int32Array != 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined,
       'JS engine does not provide full typed array support');

// If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
assert(!Module['wasmMemory'], 'Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally');
assert(!Module['INITIAL_MEMORY'], 'Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically');

// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max)>>2)] = 0x02135467;
  HEAPU32[(((max)+(4))>>2)] = 0x89BACDFE;
  // Also test the global address 0 for integrity.
  HEAPU32[((0)>>2)] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max)>>2)];
  var cookie2 = HEAPU32[(((max)+(4))>>2)];
  if (cookie1 != 0x02135467 || cookie2 != 0x89BACDFE) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0)>>2)] != 0x63736d65 /* 'emsc' */) {
    abort('Runtime error: The application has corrupted its heap memory area (address zero)!');
  }
}
// end include: runtime_stack_check.js
var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;

function preRun() {
  var preRuns = Module['preRun'];
  if (preRuns) {
    if (typeof preRuns == 'function') preRuns = [preRuns];
    preRuns.forEach(addOnPreRun);
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;

  checkStackCookie();

  
if (!Module['noFSInit'] && !FS.initialized)
  FS.init();
FS.ignorePermissions = false;

TTY.init();
  callRuntimeCallbacks(__ATINIT__);
}

function postRun() {
  checkStackCookie();

  var postRuns = Module['postRun'];
  if (postRuns) {
    if (typeof postRuns == 'function') postRuns = [postRuns];
    postRuns.forEach(addOnPostRun);
  }

  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnExit(cb) {
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// include: runtime_math.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
// end include: runtime_math.js
// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}

function addRunDependency(id) {
  runDependencies++;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(() => {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err(`dependency: ${dep}`);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;

  Module['monitorRunDependencies']?.(runDependencies);

  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

/** @param {string|number=} what */
function abort(what) {
  Module['onAbort']?.(what);

  what = 'Aborted(' + what + ')';
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);

  ABORT = true;

  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.

  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */
  var e = new WebAssembly.RuntimeError(what);

  readyPromiseReject(e);
  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// include: URIUtils.js
// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

/**
 * Indicates whether filename is a base64 data URI.
 * @noinline
 */
var isDataURI = (filename) => filename.startsWith(dataURIPrefix);

/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */
var isFileURI = (filename) => filename.startsWith('file://');
// end include: URIUtils.js
function createExportWrapper(name, nargs) {
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return f(...args);
  };
}

// include: runtime_exceptions.js
// end include: runtime_exceptions.js
function findWasmBinary() {
    var f = 'pdfium.wasm';
    if (!isDataURI(f)) {
      return locateFile(f);
    }
    return f;
}

var wasmBinaryFile;

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw 'both async and sync fetching of the wasm failed';
}

function getBinaryPromise(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary
      ) {
    // Fetch the binary using readAsync
    return readAsync(binaryFile).then(
      (response) => new Uint8Array(/** @type{!ArrayBuffer} */(response)),
      // Fall back to getBinarySync if readAsync fails
      () => getBinarySync(binaryFile)
    );
  }

  // Otherwise, getBinarySync should be able to get it synchronously
  return Promise.resolve().then(() => getBinarySync(binaryFile));
}

function instantiateArrayBuffer(binaryFile, imports, receiver) {
  return getBinaryPromise(binaryFile).then((binary) => {
    return WebAssembly.instantiate(binary, imports);
  }).then(receiver, (reason) => {
    err(`failed to asynchronously prepare wasm: ${reason}`);

    // Warn on some common problems.
    if (isFileURI(wasmBinaryFile)) {
      err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  });
}

function instantiateAsync(binary, binaryFile, imports, callback) {
  if (!binary &&
      typeof WebAssembly.instantiateStreaming == 'function' &&
      !isDataURI(binaryFile) &&
      // Avoid instantiateStreaming() on Node.js environment for now, as while
      // Node.js v18.1.0 implements it, it does not have a full fetch()
      // implementation yet.
      //
      // Reference:
      //   https://github.com/emscripten-core/emscripten/pull/16917
      !ENVIRONMENT_IS_NODE &&
      typeof fetch == 'function') {
    return fetch(binaryFile, { credentials: 'same-origin' }).then((response) => {
      // Suppress closure warning here since the upstream definition for
      // instantiateStreaming only allows Promise<Repsponse> rather than
      // an actual Response.
      // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
      /** @suppress {checkTypes} */
      var result = WebAssembly.instantiateStreaming(response, imports);

      return result.then(
        callback,
        function(reason) {
          // We expect the most common failure cause to be a bad MIME type for the binary,
          // in which case falling back to ArrayBuffer instantiation should work.
          err(`wasm streaming compile failed: ${reason}`);
          err('falling back to ArrayBuffer instantiation');
          return instantiateArrayBuffer(binaryFile, imports, callback);
        });
    });
  }
  return instantiateArrayBuffer(binaryFile, imports, callback);
}

function getWasmImports() {
  // prepare imports
  return {
    'env': wasmImports,
    'wasi_snapshot_preview1': wasmImports,
  }
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm() {
  var info = getWasmImports();
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;

    Module['wasmExports'] = wasmExports;

    wasmMemory = wasmExports['memory'];
    
    assert(wasmMemory, 'memory not found in wasm exports');
    updateMemoryViews();

    wasmTable = wasmExports['__indirect_function_table'];
    
    assert(wasmTable, 'table not found in wasm exports');

    addOnInit(wasmExports['__wasm_call_ctors']);

    removeRunDependency('wasm-instantiate');
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency('wasm-instantiate');

  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, 'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?');
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    receiveInstance(result['instance']);
  }

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module['instantiateWasm']) {
    try {
      return Module['instantiateWasm'](info, receiveInstance);
    } catch(e) {
      err(`Module.instantiateWasm callback failed with error: ${e}`);
        // If instantiation fails, reject the module ready promise.
        readyPromiseReject(e);
    }
  }

  wasmBinaryFile ??= findWasmBinary();

  // If instantiation fails, reject the module ready promise.
  instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(readyPromiseReject);
  return {}; // no exports yet; we'll fill them in later
}

// Globals used by JS i64 conversions (see makeSetValue)
var tempDouble;
var tempI64;

// include: runtime_debug.js
// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 0x6373;
  if (h8[0] !== 0x73 || h8[1] !== 0x63) throw 'Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)';
})();

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)');
}

function legacyModuleProp(prop, newName, incoming=true) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      get() {
        let extra = incoming ? ' (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)' : '';
        abort(`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra);

      }
    });
  }
}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === 'FS_createPath' ||
         name === 'FS_createDataFile' ||
         name === 'FS_createPreloadedFile' ||
         name === 'FS_unlink' ||
         name === 'addRunDependency' ||
         // The old FS has some functionality that WasmFS lacks.
         name === 'FS_createLazyFile' ||
         name === 'FS_createDevice' ||
         name === 'removeRunDependency';
}

/**
 * Intercept access to a global symbol.  This enables us to give informative
 * warnings/errors when folks attempt to use symbols they did not include in
 * their build, or no symbols that no longer exist.
 */
function hookGlobalSymbolAccess(sym, func) {
  // In MODULARIZE mode the generated code runs inside a function scope and not
  // the global scope, and JavaScript does not provide access to function scopes
  // so we cannot dynamically modify the scrope using `defineProperty` in this
  // case.
  //
  // In this mode we simply ignore requests for `hookGlobalSymbolAccess`. Since
  // this is a debug-only feature, skipping it is not major issue.
}

function missingGlobal(sym, msg) {
  hookGlobalSymbolAccess(sym, () => {
    warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
  });
}

missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer');
missingGlobal('asm', 'Please use wasmExports instead');

function missingLibrarySymbol(sym) {
  hookGlobalSymbolAccess(sym, () => {
    // Can't `abort()` here because it would break code that does runtime
    // checks.  e.g. `if (typeof SDL === 'undefined')`.
    var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
    // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
    // library.js, which means $name for a JS name with no prefix, or name
    // for a JS name like _name.
    var librarySymbol = sym;
    if (!librarySymbol.startsWith('_')) {
      librarySymbol = '$' + sym;
    }
    msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
    if (isExportedByForceFilesystem(sym)) {
      msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
    }
    warnOnce(msg);
  });

  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you';
        }
        abort(msg);
      }
    });
  }
}

// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}
// end include: runtime_debug.js
// === Body ===
// end include: preamble.js


  /** @constructor */
  function ExitStatus(status) {
      this.name = 'ExitStatus';
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }

  var callRuntimeCallbacks = (callbacks) => {
      // Pass the module as the first argument.
      callbacks.forEach((f) => f(Module));
    };

  
    /**
     * @param {number} ptr
     * @param {string} type
     */
  function getValue(ptr, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': return HEAP8[ptr];
      case 'i8': return HEAP8[ptr];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': abort('to do getValue(i64) use WASM_BIGINT');
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      case '*': return HEAPU32[((ptr)>>2)];
      default: abort(`invalid type for getValue: ${type}`);
    }
  }

  var noExitRuntime = Module['noExitRuntime'] || true;

  var ptrToString = (ptr) => {
      assert(typeof ptr === 'number');
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      ptr >>>= 0;
      return '0x' + ptr.toString(16).padStart(8, '0');
    };

  
    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
  function setValue(ptr, value, type = 'i8') {
    if (type.endsWith('*')) type = '*';
    switch (type) {
      case 'i1': HEAP8[ptr] = value; break;
      case 'i8': HEAP8[ptr] = value; break;
      case 'i16': HEAP16[((ptr)>>1)] = value; break;
      case 'i32': HEAP32[((ptr)>>2)] = value; break;
      case 'i64': abort('to do setValue(i64) use WASM_BIGINT');
      case 'float': HEAPF32[((ptr)>>2)] = value; break;
      case 'double': HEAPF64[((ptr)>>3)] = value; break;
      case '*': HEAPU32[((ptr)>>2)] = value; break;
      default: abort(`invalid type for setValue: ${type}`);
    }
  }

  var stackRestore = (val) => __emscripten_stack_restore(val);

  var stackSave = () => _emscripten_stack_get_current();

  var warnOnce = (text) => {
      warnOnce.shown ||= {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;
        err(text);
      }
    };

  var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder() : undefined;
  
    /**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number=} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */
  var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.  Also, use the length info to avoid running tiny
      // strings through TextDecoder, since .subarray() allocates garbage.
      // (As a tiny code save trick, compare endPtr against endIdx using a negation,
      // so that undefined/NaN means Infinity)
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = '';
      // If building with TextDecoder, we have already computed the string length
      // above, so test loop end condition against that
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++];
        if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 0xF0) == 0xE0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        } else {
          if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte ' + ptrToString(u0) + ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!');
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
        }
  
        if (u0 < 0x10000) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 0x10000;
          str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
      }
      return str;
    };
  
    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */
  var UTF8ToString = (ptr, maxBytesToRead) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`);
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
    };
  var ___assert_fail = (condition, filename, line, func) => {
      abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [filename ? UTF8ToString(filename) : 'unknown filename', line, func ? UTF8ToString(func) : 'unknown function']);
    };

  /** @suppress {duplicate } */
  function syscallGetVarargI() {
      assert(SYSCALLS.varargs != undefined);
      // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
      var ret = HEAP32[((+SYSCALLS.varargs)>>2)];
      SYSCALLS.varargs += 4;
      return ret;
    }
  var syscallGetVarargP = syscallGetVarargI;
  
  
  var PATH = {
  isAbs:(path) => path.charAt(0) === '/',
  splitPath:(filename) => {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },
  normalizeArray:(parts, allowAboveRoot) => {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },
  normalize:(path) => {
        var isAbsolute = PATH.isAbs(path),
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter((p) => !!p), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },
  dirname:(path) => {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },
  basename:(path) => {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        path = PATH.normalize(path);
        path = path.replace(/\/$/, "");
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },
  join:(...paths) => PATH.normalize(paths.join('/')),
  join2:(l, r) => PATH.normalize(l + '/' + r),
  };
  
  var initRandomFill = () => {
      if (typeof crypto == 'object' && typeof crypto['getRandomValues'] == 'function') {
        // for modern web browsers
        return (view) => crypto.getRandomValues(view);
      } else
      if (ENVIRONMENT_IS_NODE) {
        // for nodejs with or without crypto support included
        try {
          var crypto_module = require('crypto');
          var randomFillSync = crypto_module['randomFillSync'];
          if (randomFillSync) {
            // nodejs with LTS crypto support
            return (view) => crypto_module['randomFillSync'](view);
          }
          // very old nodejs with the original crypto API
          var randomBytes = crypto_module['randomBytes'];
          return (view) => (
            view.set(randomBytes(view.byteLength)),
            // Return the original view to match modern native implementations.
            view
          );
        } catch (e) {
          // nodejs doesn't have crypto support
        }
      }
      // we couldn't find a proper implementation, as Math.random() is not suitable for /dev/random, see emscripten-core/emscripten/pull/7096
      abort('no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: (array) => { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };');
    };
  var randomFill = (view) => {
      // Lazily init on the first invocation.
      return (randomFill = initRandomFill())(view);
    };
  
  
  
  var PATH_FS = {
  resolve:(...args) => {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? args[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path != 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = PATH.isAbs(path);
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter((p) => !!p), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },
  relative:(from, to) => {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      },
  };
  
  
  
  var FS_stdin_getChar_buffer = [];
  
  var lengthBytesUTF8 = (str) => {
      var len = 0;
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i); // possibly a lead surrogate
        if (c <= 0x7F) {
          len++;
        } else if (c <= 0x7FF) {
          len += 2;
        } else if (c >= 0xD800 && c <= 0xDFFF) {
          len += 4; ++i;
        } else {
          len += 3;
        }
      }
      return len;
    };
  
  var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`);
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0))
        return 0;
  
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.charCodeAt(i); // possibly a lead surrogate
        if (u >= 0xD800 && u <= 0xDFFF) {
          var u1 = str.charCodeAt(++i);
          u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
        }
        if (u <= 0x7F) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 0x7FF) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 0xC0 | (u >> 6);
          heap[outIdx++] = 0x80 | (u & 63);
        } else if (u <= 0xFFFF) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 0xE0 | (u >> 12);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        } else {
          if (outIdx + 3 >= endIdx) break;
          if (u > 0x10FFFF) warnOnce('Invalid Unicode code point ' + ptrToString(u) + ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).');
          heap[outIdx++] = 0xF0 | (u >> 18);
          heap[outIdx++] = 0x80 | ((u >> 12) & 63);
          heap[outIdx++] = 0x80 | ((u >> 6) & 63);
          heap[outIdx++] = 0x80 | (u & 63);
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0;
      return outIdx - startIdx;
    };
  /** @type {function(string, boolean=, number=)} */
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }
  var FS_stdin_getChar = () => {
      if (!FS_stdin_getChar_buffer.length) {
        var result = null;
        if (ENVIRONMENT_IS_NODE) {
          // we will read data by chunks of BUFSIZE
          var BUFSIZE = 256;
          var buf = Buffer.alloc(BUFSIZE);
          var bytesRead = 0;
  
          // For some reason we must suppress a closure warning here, even though
          // fd definitely exists on process.stdin, and is even the proper way to
          // get the fd of stdin,
          // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
          // This started to happen after moving this logic out of library_tty.js,
          // so it is related to the surrounding code in some unclear manner.
          /** @suppress {missingProperties} */
          var fd = process.stdin.fd;
  
          try {
            bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
          } catch(e) {
            // Cross-platform differences: on Windows, reading EOF throws an
            // exception, but on other OSes, reading EOF returns 0. Uniformize
            // behavior by treating the EOF exception to return 0.
            if (e.toString().includes('EOF')) bytesRead = 0;
            else throw e;
          }
  
          if (bytesRead > 0) {
            result = buf.slice(0, bytesRead).toString('utf-8');
          }
        } else
        if (typeof window != 'undefined' &&
          typeof window.prompt == 'function') {
          // Browser.
          result = window.prompt('Input: ');  // returns null on cancel
          if (result !== null) {
            result += '\n';
          }
        } else
        if (typeof readline == 'function') {
          // Command line.
          result = readline();
          if (result) {
            result += '\n';
          }
        } else
        {}
        if (!result) {
          return null;
        }
        FS_stdin_getChar_buffer = intArrayFromString(result, true);
      }
      return FS_stdin_getChar_buffer.shift();
    };
  var TTY = {
  ttys:[],
  init() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process.stdin.setEncoding('utf8');
        // }
      },
  shutdown() {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process.stdin.pause();
        // }
      },
  register(dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },
  stream_ops:{
  open(stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(43);
          }
          stream.tty = tty;
          stream.seekable = false;
        },
  close(stream) {
          // flush any pending line data
          stream.tty.ops.fsync(stream.tty);
        },
  fsync(stream) {
          stream.tty.ops.fsync(stream.tty);
        },
  read(stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(60);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(29);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(6);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },
  write(stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(60);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        },
  },
  default_tty_ops:{
  get_char(tty) {
          return FS_stdin_getChar();
        },
  put_char(tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },
  fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  ioctl_tcgets(tty) {
          // typical setting
          return {
            c_iflag: 25856,
            c_oflag: 5,
            c_cflag: 191,
            c_lflag: 35387,
            c_cc: [
              0x03, 0x1c, 0x7f, 0x15, 0x04, 0x00, 0x01, 0x00, 0x11, 0x13, 0x1a, 0x00,
              0x12, 0x0f, 0x17, 0x16, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ]
          };
        },
  ioctl_tcsets(tty, optional_actions, data) {
          // currently just ignore
          return 0;
        },
  ioctl_tiocgwinsz(tty) {
          return [24, 80];
        },
  },
  default_tty1_ops:{
  put_char(tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },
  fsync(tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output));
            tty.output = [];
          }
        },
  },
  };
  
  
  var zeroMemory = (address, size) => {
      HEAPU8.fill(0, address, address + size);
    };
  
  var alignMemory = (size, alignment) => {
      assert(alignment, "alignment argument is required");
      return Math.ceil(size / alignment) * alignment;
    };
  var mmapAlloc = (size) => {
      size = alignMemory(size, 65536);
      var ptr = _emscripten_builtin_memalign(65536, size);
      if (ptr) zeroMemory(ptr, size);
      return ptr;
    };
  var MEMFS = {
  ops_table:null,
  mount(mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },
  createNode(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(63);
        }
        MEMFS.ops_table ||= {
          dir: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              lookup: MEMFS.node_ops.lookup,
              mknod: MEMFS.node_ops.mknod,
              rename: MEMFS.node_ops.rename,
              unlink: MEMFS.node_ops.unlink,
              rmdir: MEMFS.node_ops.rmdir,
              readdir: MEMFS.node_ops.readdir,
              symlink: MEMFS.node_ops.symlink
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek
            }
          },
          file: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: {
              llseek: MEMFS.stream_ops.llseek,
              read: MEMFS.stream_ops.read,
              write: MEMFS.stream_ops.write,
              allocate: MEMFS.stream_ops.allocate,
              mmap: MEMFS.stream_ops.mmap,
              msync: MEMFS.stream_ops.msync
            }
          },
          link: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr,
              readlink: MEMFS.node_ops.readlink
            },
            stream: {}
          },
          chrdev: {
            node: {
              getattr: MEMFS.node_ops.getattr,
              setattr: MEMFS.node_ops.setattr
            },
            stream: FS.chrdev_stream_ops
          }
        };
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
          parent.timestamp = node.timestamp;
        }
        return node;
      },
  getFileDataAsTypedArray(node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },
  expandFileStorage(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
        // avoid overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) >>> 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
      },
  resizeFileStorage(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
        } else {
          var oldContents = node.contents;
          node.contents = new Uint8Array(newSize); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
        }
      },
  node_ops:{
  getattr(node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },
  setattr(node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },
  lookup(parent, name) {
          throw FS.genericErrors[44];
        },
  mknod(parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },
  rename(old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(55);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.parent.timestamp = Date.now()
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          new_dir.timestamp = old_node.parent.timestamp;
        },
  unlink(parent, name) {
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
  rmdir(parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(55);
          }
          delete parent.contents[name];
          parent.timestamp = Date.now();
        },
  readdir(node) {
          var entries = ['.', '..'];
          for (var key of Object.keys(node.contents)) {
            entries.push(key);
          }
          return entries;
        },
  symlink(parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },
  readlink(node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(28);
          }
          return node.link;
        },
  },
  stream_ops:{
  read(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },
  write(stream, buffer, offset, length, position, canOwn) {
          // The data buffer should be a typed array view
          assert(!(buffer instanceof ArrayBuffer));
          // If the buffer is located in main memory (HEAP), and if
          // memory can grow, we can't hold on to references of the
          // memory buffer, as they may get invalidated. That means we
          // need to do copy its contents.
          if (buffer.buffer === HEAP8.buffer) {
            canOwn = false;
          }
  
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = buffer.slice(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) {
            // Use typed array write which is available.
            node.contents.set(buffer.subarray(offset, offset + length), position);
          } else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position + length);
          return length;
        },
  llseek(stream, offset, whence) {
          var position = offset;
          if (whence === 1) {
            position += stream.position;
          } else if (whence === 2) {
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(28);
          }
          return position;
        },
  allocate(stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },
  mmap(stream, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(43);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
            // We can't emulate MAP_SHARED when the file is not backed by the
            // buffer we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            allocated = true;
            ptr = mmapAlloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(48);
            }
            if (contents) {
              // Try to avoid unnecessary slices.
              if (position > 0 || position + length < contents.length) {
                if (contents.subarray) {
                  contents = contents.subarray(position, position + length);
                } else {
                  contents = Array.prototype.slice.call(contents, position, position + length);
                }
              }
              HEAP8.set(contents, ptr);
            }
          }
          return { ptr, allocated };
        },
  msync(stream, buffer, offset, length, mmapFlags) {
          MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        },
  },
  };
  
  /** @param {boolean=} noRunDep */
  var asyncLoad = (url, onload, onerror, noRunDep) => {
      var dep = !noRunDep ? getUniqueRunDependency(`al ${url}`) : '';
      readAsync(url).then(
        (arrayBuffer) => {
          assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
          onload(new Uint8Array(arrayBuffer));
          if (dep) removeRunDependency(dep);
        },
        (err) => {
          if (onerror) {
            onerror();
          } else {
            throw `Loading data file "${url}" failed.`;
          }
        }
      );
      if (dep) addRunDependency(dep);
    };
  
  
  var FS_createDataFile = (parent, name, fileData, canRead, canWrite, canOwn) => {
      FS.createDataFile(parent, name, fileData, canRead, canWrite, canOwn);
    };
  
  var preloadPlugins = Module['preloadPlugins'] || [];
  var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
      // Ensure plugins are ready.
      if (typeof Browser != 'undefined') Browser.init();
  
      var handled = false;
      preloadPlugins.forEach((plugin) => {
        if (handled) return;
        if (plugin['canHandle'](fullname)) {
          plugin['handle'](byteArray, fullname, finish, onerror);
          handled = true;
        }
      });
      return handled;
    };
  var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
      // TODO we should allow people to just pass in a complete filename instead
      // of parent and name being that we just join them anyways
      var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
      var dep = getUniqueRunDependency(`cp ${fullname}`); // might have several active requests for the same fullname
      function processData(byteArray) {
        function finish(byteArray) {
          preFinish?.();
          if (!dontCreateFile) {
            FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
          }
          onload?.();
          removeRunDependency(dep);
        }
        if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
          onerror?.();
          removeRunDependency(dep);
        })) {
          return;
        }
        finish(byteArray);
      }
      addRunDependency(dep);
      if (typeof url == 'string') {
        asyncLoad(url, processData, onerror);
      } else {
        processData(url);
      }
    };
  
  var FS_modeStringToFlags = (str) => {
      var flagModes = {
        'r': 0,
        'r+': 2,
        'w': 512 | 64 | 1,
        'w+': 512 | 64 | 2,
        'a': 1024 | 64 | 1,
        'a+': 1024 | 64 | 2,
      };
      var flags = flagModes[str];
      if (typeof flags == 'undefined') {
        throw new Error(`Unknown file open mode: ${str}`);
      }
      return flags;
    };
  
  var FS_getMode = (canRead, canWrite) => {
      var mode = 0;
      if (canRead) mode |= 292 | 73;
      if (canWrite) mode |= 146;
      return mode;
    };
  
  
  
  
  
  
  var strError = (errno) => {
      return UTF8ToString(_strerror(errno));
    };
  
  var ERRNO_CODES = {
      'EPERM': 63,
      'ENOENT': 44,
      'ESRCH': 71,
      'EINTR': 27,
      'EIO': 29,
      'ENXIO': 60,
      'E2BIG': 1,
      'ENOEXEC': 45,
      'EBADF': 8,
      'ECHILD': 12,
      'EAGAIN': 6,
      'EWOULDBLOCK': 6,
      'ENOMEM': 48,
      'EACCES': 2,
      'EFAULT': 21,
      'ENOTBLK': 105,
      'EBUSY': 10,
      'EEXIST': 20,
      'EXDEV': 75,
      'ENODEV': 43,
      'ENOTDIR': 54,
      'EISDIR': 31,
      'EINVAL': 28,
      'ENFILE': 41,
      'EMFILE': 33,
      'ENOTTY': 59,
      'ETXTBSY': 74,
      'EFBIG': 22,
      'ENOSPC': 51,
      'ESPIPE': 70,
      'EROFS': 69,
      'EMLINK': 34,
      'EPIPE': 64,
      'EDOM': 18,
      'ERANGE': 68,
      'ENOMSG': 49,
      'EIDRM': 24,
      'ECHRNG': 106,
      'EL2NSYNC': 156,
      'EL3HLT': 107,
      'EL3RST': 108,
      'ELNRNG': 109,
      'EUNATCH': 110,
      'ENOCSI': 111,
      'EL2HLT': 112,
      'EDEADLK': 16,
      'ENOLCK': 46,
      'EBADE': 113,
      'EBADR': 114,
      'EXFULL': 115,
      'ENOANO': 104,
      'EBADRQC': 103,
      'EBADSLT': 102,
      'EDEADLOCK': 16,
      'EBFONT': 101,
      'ENOSTR': 100,
      'ENODATA': 116,
      'ETIME': 117,
      'ENOSR': 118,
      'ENONET': 119,
      'ENOPKG': 120,
      'EREMOTE': 121,
      'ENOLINK': 47,
      'EADV': 122,
      'ESRMNT': 123,
      'ECOMM': 124,
      'EPROTO': 65,
      'EMULTIHOP': 36,
      'EDOTDOT': 125,
      'EBADMSG': 9,
      'ENOTUNIQ': 126,
      'EBADFD': 127,
      'EREMCHG': 128,
      'ELIBACC': 129,
      'ELIBBAD': 130,
      'ELIBSCN': 131,
      'ELIBMAX': 132,
      'ELIBEXEC': 133,
      'ENOSYS': 52,
      'ENOTEMPTY': 55,
      'ENAMETOOLONG': 37,
      'ELOOP': 32,
      'EOPNOTSUPP': 138,
      'EPFNOSUPPORT': 139,
      'ECONNRESET': 15,
      'ENOBUFS': 42,
      'EAFNOSUPPORT': 5,
      'EPROTOTYPE': 67,
      'ENOTSOCK': 57,
      'ENOPROTOOPT': 50,
      'ESHUTDOWN': 140,
      'ECONNREFUSED': 14,
      'EADDRINUSE': 3,
      'ECONNABORTED': 13,
      'ENETUNREACH': 40,
      'ENETDOWN': 38,
      'ETIMEDOUT': 73,
      'EHOSTDOWN': 142,
      'EHOSTUNREACH': 23,
      'EINPROGRESS': 26,
      'EALREADY': 7,
      'EDESTADDRREQ': 17,
      'EMSGSIZE': 35,
      'EPROTONOSUPPORT': 66,
      'ESOCKTNOSUPPORT': 137,
      'EADDRNOTAVAIL': 4,
      'ENETRESET': 39,
      'EISCONN': 30,
      'ENOTCONN': 53,
      'ETOOMANYREFS': 141,
      'EUSERS': 136,
      'EDQUOT': 19,
      'ESTALE': 72,
      'ENOTSUP': 138,
      'ENOMEDIUM': 148,
      'EILSEQ': 25,
      'EOVERFLOW': 61,
      'ECANCELED': 11,
      'ENOTRECOVERABLE': 56,
      'EOWNERDEAD': 62,
      'ESTRPIPE': 135,
    };
  var FS = {
  root:null,
  mounts:[],
  devices:{
  },
  streams:[],
  nextInode:1,
  nameTable:null,
  currentPath:"/",
  initialized:false,
  ignorePermissions:true,
  ErrnoError:class extends Error {
        // We set the `name` property to be able to identify `FS.ErrnoError`
        // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
        // - when using PROXYFS, an error can come from an underlying FS
        // as different FS objects have their own FS.ErrnoError each,
        // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
        // we'll use the reliable test `err.name == "ErrnoError"` instead
        constructor(errno) {
          super(runtimeInitialized ? strError(errno) : '');
          // TODO(sbc): Use the inline member declaration syntax once we
          // support it in acorn and closure.
          this.name = 'ErrnoError';
          this.errno = errno;
          for (var key in ERRNO_CODES) {
            if (ERRNO_CODES[key] === errno) {
              this.code = key;
              break;
            }
          }
        }
      },
  genericErrors:{
  },
  filesystems:null,
  syncFSRequests:0,
  readFiles:{
  },
  FSStream:class {
        constructor() {
          // TODO(https://github.com/emscripten-core/emscripten/issues/21414):
          // Use inline field declarations.
          this.shared = {};
        }
        get object() {
          return this.node;
        }
        set object(val) {
          this.node = val;
        }
        get isRead() {
          return (this.flags & 2097155) !== 1;
        }
        get isWrite() {
          return (this.flags & 2097155) !== 0;
        }
        get isAppend() {
          return (this.flags & 1024);
        }
        get flags() {
          return this.shared.flags;
        }
        set flags(val) {
          this.shared.flags = val;
        }
        get position() {
          return this.shared.position;
        }
        set position(val) {
          this.shared.position = val;
        }
      },
  FSNode:class {
        constructor(parent, name, mode, rdev) {
          if (!parent) {
            parent = this;  // root node sets parent to itself
          }
          this.parent = parent;
          this.mount = parent.mount;
          this.mounted = null;
          this.id = FS.nextInode++;
          this.name = name;
          this.mode = mode;
          this.node_ops = {};
          this.stream_ops = {};
          this.rdev = rdev;
          this.readMode = 292 | 73;
          this.writeMode = 146;
        }
        get read() {
          return (this.mode & this.readMode) === this.readMode;
        }
        set read(val) {
          val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
        }
        get write() {
          return (this.mode & this.writeMode) === this.writeMode;
        }
        set write(val) {
          val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
        }
        get isFolder() {
          return FS.isDir(this.mode);
        }
        get isDevice() {
          return FS.isChrdev(this.mode);
        }
      },
  lookupPath(path, opts = {}) {
        path = PATH_FS.resolve(path);
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        opts = Object.assign(defaults, opts)
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(32);
        }
  
        // split the absolute path
        var parts = path.split('/').filter((p) => !!p);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count + 1 });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(32);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },
  getPath(node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? `${mount}/${path}` : mount + path;
          }
          path = path ? `${node.name}/${path}` : node.name;
          node = node.parent;
        }
      },
  hashName(parentid, name) {
        var hash = 0;
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },
  hashAddNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },
  hashRemoveNode(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },
  lookupNode(parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },
  createNode(parent, name, mode, rdev) {
        assert(typeof parent == 'object')
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },
  destroyNode(node) {
        FS.hashRemoveNode(node);
      },
  isRoot(node) {
        return node === node.parent;
      },
  isMountpoint(node) {
        return !!node.mounted;
      },
  isFile(mode) {
        return (mode & 61440) === 32768;
      },
  isDir(mode) {
        return (mode & 61440) === 16384;
      },
  isLink(mode) {
        return (mode & 61440) === 40960;
      },
  isChrdev(mode) {
        return (mode & 61440) === 8192;
      },
  isBlkdev(mode) {
        return (mode & 61440) === 24576;
      },
  isFIFO(mode) {
        return (mode & 61440) === 4096;
      },
  isSocket(mode) {
        return (mode & 49152) === 49152;
      },
  flagsToPermissionString(flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },
  nodePermissions(node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.includes('r') && !(node.mode & 292)) {
          return 2;
        } else if (perms.includes('w') && !(node.mode & 146)) {
          return 2;
        } else if (perms.includes('x') && !(node.mode & 73)) {
          return 2;
        }
        return 0;
      },
  mayLookup(dir) {
        if (!FS.isDir(dir.mode)) return 54;
        var errCode = FS.nodePermissions(dir, 'x');
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0;
      },
  mayCreate(dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return 20;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },
  mayDelete(dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var errCode = FS.nodePermissions(dir, 'wx');
        if (errCode) {
          return errCode;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 54;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 10;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return 31;
          }
        }
        return 0;
      },
  mayOpen(node, flags) {
        if (!node) {
          return 44;
        }
        if (FS.isLink(node.mode)) {
          return 32;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return 31;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },
  MAX_OPEN_FDS:4096,
  nextfd() {
        for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(33);
      },
  getStreamChecked(fd) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(8);
        }
        return stream;
      },
  getStream:(fd) => FS.streams[fd],
  createStream(stream, fd = -1) {
        assert(fd >= -1);
  
        // clone it, so we can return an instance of FSStream
        stream = Object.assign(new FS.FSStream(), stream);
        if (fd == -1) {
          fd = FS.nextfd();
        }
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },
  closeStream(fd) {
        FS.streams[fd] = null;
      },
  dupStream(origStream, fd = -1) {
        var stream = FS.createStream(origStream, fd);
        stream.stream_ops?.dup?.(stream);
        return stream;
      },
  chrdev_stream_ops:{
  open(stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          stream.stream_ops.open?.(stream);
        },
  llseek() {
          throw new FS.ErrnoError(70);
        },
  },
  major:(dev) => ((dev) >> 8),
  minor:(dev) => ((dev) & 0xff),
  makedev:(ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },
  getDevice:(dev) => FS.devices[dev],
  getMounts(mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push(...m.mounts);
        }
  
        return mounts;
      },
  syncfs(populate, callback) {
        if (typeof populate == 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(errCode) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(errCode);
        }
  
        function done(errCode) {
          if (errCode) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(errCode);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach((mount) => {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },
  mount(type, opts, mountpoint) {
        if (typeof type == 'string') {
          // The filesystem was not included, and instead we have an error
          // message stored in the variable.
          throw type;
        }
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(10);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54);
          }
        }
  
        var mount = {
          type,
          opts,
          mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },
  unmount(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(28);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach((hash) => {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.includes(current.mount)) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },
  lookup(parent, name) {
        return parent.node_ops.lookup(parent, name);
      },
  mknod(path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },
  create(path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },
  mkdir(path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },
  mkdirTree(path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 20) throw e;
          }
        }
      },
  mkdev(path, mode, dev) {
        if (typeof dev == 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },
  symlink(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
          throw new FS.ErrnoError(44);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(63);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },
  rename(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
  
        // let the errors from non existent directories percolate up
        lookup = FS.lookupPath(old_path, { parent: true });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, { parent: true });
        new_dir = lookup.node;
  
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(75);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(28);
        }
        // new path should not be an ancestor of the old path
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(55);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        errCode = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(10);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          errCode = FS.nodePermissions(old_dir, 'w');
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
          // update old node (we do this here to avoid each backend 
          // needing to)
          old_node.parent = new_dir;
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
      },
  rmdir(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
      },
  readdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(54);
        }
        return node.node_ops.readdir(node);
      },
  unlink(path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(44);
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(errCode);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(10);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
      },
  readlink(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(44);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(28);
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },
  stat(path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(63);
        }
        return node.node_ops.getattr(node);
      },
  lstat(path) {
        return FS.stat(path, true);
      },
  chmod(path, mode, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },
  lchmod(path, mode) {
        FS.chmod(path, mode, true);
      },
  fchmod(fd, mode) {
        var stream = FS.getStreamChecked(fd);
        FS.chmod(stream.node, mode);
      },
  chown(path, uid, gid, dontFollow) {
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },
  lchown(path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },
  fchown(fd, uid, gid) {
        var stream = FS.getStreamChecked(fd);
        FS.chown(stream.node, uid, gid);
      },
  truncate(path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(28);
        }
        var node;
        if (typeof path == 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(63);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(28);
        }
        var errCode = FS.nodePermissions(node, 'w');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },
  ftruncate(fd, len) {
        var stream = FS.getStreamChecked(fd);
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(28);
        }
        FS.truncate(stream.node, len);
      },
  utime(path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },
  open(path, flags, mode) {
        if (path === "") {
          throw new FS.ErrnoError(44);
        }
        flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;
        if ((flags & 64)) {
          mode = typeof mode == 'undefined' ? 438 /* 0666 */ : mode;
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path == 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(20);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(44);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(54);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var errCode = FS.mayOpen(node, flags);
          if (errCode) {
            throw new FS.ErrnoError(errCode);
          }
        }
        // do truncation if necessary
        if ((flags & 512) && !created) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512 | 131072);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        });
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
          }
        }
        return stream;
      },
  close(stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },
  isClosed(stream) {
        return stream.fd === null;
      },
  llseek(stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(70);
        }
        if (whence != 0 && whence != 1 && whence != 2) {
          throw new FS.ErrnoError(28);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },
  read(stream, buffer, offset, length, position) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(28);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },
  write(stream, buffer, offset, length, position, canOwn) {
        assert(offset >= 0);
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(28);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(31);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(28);
        }
        if (stream.seekable && stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position != 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(70);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten;
      },
  allocate(stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(8);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(28);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(8);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(138);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },
  mmap(stream, length, position, prot, flags) {
        // User requests writing to file (prot & PROT_WRITE != 0).
        // Checking if we have permissions to write to the file unless
        // MAP_PRIVATE flag is set. According to POSIX spec it is possible
        // to write to file opened in read-only mode with MAP_PRIVATE flag,
        // as all modifications will be visible only in the memory of
        // the current process.
        if ((prot & 2) !== 0
            && (flags & 2) === 0
            && (stream.flags & 2097155) !== 2) {
          throw new FS.ErrnoError(2);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(2);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(43);
        }
        if (!length) {
          throw new FS.ErrnoError(28);
        }
        return stream.stream_ops.mmap(stream, length, position, prot, flags);
      },
  msync(stream, buffer, offset, length, mmapFlags) {
        assert(offset >= 0);
        if (!stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },
  ioctl(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(59);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },
  readFile(path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error(`Invalid encoding type "${opts.encoding}"`);
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },
  writeFile(path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data == 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },
  cwd:() => FS.currentPath,
  chdir(path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(44);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(54);
        }
        var errCode = FS.nodePermissions(lookup.node, 'x');
        if (errCode) {
          throw new FS.ErrnoError(errCode);
        }
        FS.currentPath = lookup.path;
      },
  createDefaultDirectories() {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },
  createDefaultDevices() {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: () => 0,
          write: (stream, buffer, offset, length, pos) => length,
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using err() rather than out()
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        // use a buffer to avoid overhead of individual crypto calls per byte
        var randomBuffer = new Uint8Array(1024), randomLeft = 0;
        var randomByte = () => {
          if (randomLeft === 0) {
            randomLeft = randomFill(randomBuffer).byteLength;
          }
          return randomBuffer[--randomLeft];
        };
        FS.createDevice('/dev', 'random', randomByte);
        FS.createDevice('/dev', 'urandom', randomByte);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },
  createSpecialDirectories() {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
        // name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        var proc_self = FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount() {
            var node = FS.createNode(proc_self, 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup(parent, name) {
                var fd = +name;
                var stream = FS.getStreamChecked(fd);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: () => stream.path },
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },
  createStandardStreams(input, output, error) {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (input) {
          FS.createDevice('/dev', 'stdin', input);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (output) {
          FS.createDevice('/dev', 'stdout', null, output);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (error) {
          FS.createDevice('/dev', 'stderr', null, error);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 0);
        var stdout = FS.open('/dev/stdout', 1);
        var stderr = FS.open('/dev/stderr', 1);
        assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
        assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
        assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
      },
  staticInit() {
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [44].forEach((code) => {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
        };
      },
  init(input, output, error) {
        assert(!FS.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.initialized = true;
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        input ??= Module['stdin'];
        output ??= Module['stdout'];
        error ??= Module['stderr'];
  
        FS.createStandardStreams(input, output, error);
      },
  quit() {
        FS.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        _fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },
  findObject(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (!ret.exists) {
          return null;
        }
        return ret.object;
      },
  analyzePath(path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },
  createPath(parent, path, canRead, canWrite) {
        parent = typeof parent == 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },
  createFile(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(canRead, canWrite);
        return FS.create(path, mode);
      },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
        var path = name;
        if (parent) {
          parent = typeof parent == 'string' ? parent : FS.getPath(parent);
          path = name ? PATH.join2(parent, name) : parent;
        }
        var mode = FS_getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data == 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 577);
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
      },
  createDevice(parent, name, input, output) {
        var path = PATH.join2(typeof parent == 'string' ? parent : FS.getPath(parent), name);
        var mode = FS_getMode(!!input, !!output);
        FS.createDevice.major ??= 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open(stream) {
            stream.seekable = false;
          },
          close(stream) {
            // flush any pending line data
            if (output?.buffer?.length) {
              output(10);
            }
          },
          read(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(6);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(29);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },
  forceLoadFile(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (typeof XMLHttpRequest != 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else { // Command-line.
          try {
            obj.contents = readBinary(obj.url);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
      },
  createLazyFile(parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array).
        // Actual getting is abstracted away for eventual reuse.
        class LazyUint8Array {
          constructor() {
            this.lengthKnown = false;
            this.chunks = []; // Loaded chunks. Index is the chunk number
          }
          get(idx) {
            if (idx > this.length-1 || idx < 0) {
              return undefined;
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = (idx / this.chunkSize)|0;
            return this.getter(chunkNum)[chunkOffset];
          }
          setDataGetter(getter) {
            this.getter = getter;
          }
          cacheLength() {
            // Find length
            var xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
            var chunkSize = 1024*1024; // Chunk size in bytes
  
            if (!hasByteServing) chunkSize = datalength;
  
            // Function to get a range from the remote URL.
            var doXHR = (from, to) => {
              if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
              if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
              // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
              var xhr = new XMLHttpRequest();
              xhr.open('GET', url, false);
              if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
              // Some hints to the browser that we want binary data.
              xhr.responseType = 'arraybuffer';
              if (xhr.overrideMimeType) {
                xhr.overrideMimeType('text/plain; charset=x-user-defined');
              }
  
              xhr.send(null);
              if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
              if (xhr.response !== undefined) {
                return new Uint8Array(/** @type{Array<number>} */(xhr.response || []));
              }
              return intArrayFromString(xhr.responseText || '', true);
            };
            var lazyArray = this;
            lazyArray.setDataGetter((chunkNum) => {
              var start = chunkNum * chunkSize;
              var end = (chunkNum+1) * chunkSize - 1; // including this byte
              end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') {
                lazyArray.chunks[chunkNum] = doXHR(start, end);
              }
              if (typeof lazyArray.chunks[chunkNum] == 'undefined') throw new Error('doXHR failed!');
              return lazyArray.chunks[chunkNum];
            });
  
            if (usesGzip || !datalength) {
              // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
              chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
              datalength = this.getter(0).length;
              chunkSize = datalength;
              out("LazyFiles on gzip forces download of the whole file when length is accessed");
            }
  
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true;
          }
          get length() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          }
          get chunkSize() {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          }
        }
  
        if (typeof XMLHttpRequest != 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((key) => {
          var fn = node.stream_ops[key];
          stream_ops[key] = (...args) => {
            FS.forceLoadFile(node);
            return fn(...args);
          };
        });
        function writeChunks(stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        }
        // use a custom read function
        stream_ops.read = (stream, buffer, offset, length, position) => {
          FS.forceLoadFile(node);
          return writeChunks(stream, buffer, offset, length, position)
        };
        // use a custom mmap function
        stream_ops.mmap = (stream, length, position, prot, flags) => {
          FS.forceLoadFile(node);
          var ptr = mmapAlloc(length);
          if (!ptr) {
            throw new FS.ErrnoError(48);
          }
          writeChunks(stream, HEAP8, ptr, length, position);
          return { ptr, allocated: true };
        };
        node.stream_ops = stream_ops;
        return node;
      },
  absolutePath() {
        abort('FS.absolutePath has been removed; use PATH_FS.resolve instead');
      },
  createFolder() {
        abort('FS.createFolder has been removed; use FS.mkdir instead');
      },
  createLink() {
        abort('FS.createLink has been removed; use FS.symlink instead');
      },
  joinPath() {
        abort('FS.joinPath has been removed; use PATH.join instead');
      },
  mmapAlloc() {
        abort('FS.mmapAlloc has been replaced by the top level function mmapAlloc');
      },
  standardizePath() {
        abort('FS.standardizePath has been removed; use PATH.normalize instead');
      },
  };
  
  var SYSCALLS = {
  DEFAULT_POLLMASK:5,
  calculateAt(dirfd, path, allowEmpty) {
        if (PATH.isAbs(path)) {
          return path;
        }
        // relative path
        var dir;
        if (dirfd === -100) {
          dir = FS.cwd();
        } else {
          var dirstream = SYSCALLS.getStreamFromFD(dirfd);
          dir = dirstream.path;
        }
        if (path.length == 0) {
          if (!allowEmpty) {
            throw new FS.ErrnoError(44);;
          }
          return dir;
        }
        return PATH.join2(dir, path);
      },
  doStat(func, path, buf) {
        var stat = func(path);
        HEAP32[((buf)>>2)] = stat.dev;
        HEAP32[(((buf)+(4))>>2)] = stat.mode;
        HEAPU32[(((buf)+(8))>>2)] = stat.nlink;
        HEAP32[(((buf)+(12))>>2)] = stat.uid;
        HEAP32[(((buf)+(16))>>2)] = stat.gid;
        HEAP32[(((buf)+(20))>>2)] = stat.rdev;
        (tempI64 = [stat.size>>>0,(tempDouble = stat.size,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(24))>>2)] = tempI64[0],HEAP32[(((buf)+(28))>>2)] = tempI64[1]);
        HEAP32[(((buf)+(32))>>2)] = 4096;
        HEAP32[(((buf)+(36))>>2)] = stat.blocks;
        var atime = stat.atime.getTime();
        var mtime = stat.mtime.getTime();
        var ctime = stat.ctime.getTime();
        (tempI64 = [Math.floor(atime / 1000)>>>0,(tempDouble = Math.floor(atime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(40))>>2)] = tempI64[0],HEAP32[(((buf)+(44))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(48))>>2)] = (atime % 1000) * 1000 * 1000;
        (tempI64 = [Math.floor(mtime / 1000)>>>0,(tempDouble = Math.floor(mtime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(56))>>2)] = tempI64[0],HEAP32[(((buf)+(60))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(64))>>2)] = (mtime % 1000) * 1000 * 1000;
        (tempI64 = [Math.floor(ctime / 1000)>>>0,(tempDouble = Math.floor(ctime / 1000),(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(72))>>2)] = tempI64[0],HEAP32[(((buf)+(76))>>2)] = tempI64[1]);
        HEAPU32[(((buf)+(80))>>2)] = (ctime % 1000) * 1000 * 1000;
        (tempI64 = [stat.ino>>>0,(tempDouble = stat.ino,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((buf)+(88))>>2)] = tempI64[0],HEAP32[(((buf)+(92))>>2)] = tempI64[1]);
        return 0;
      },
  doMsync(addr, stream, len, flags, offset) {
        if (!FS.isFile(stream.node.mode)) {
          throw new FS.ErrnoError(43);
        }
        if (flags & 2) {
          // MAP_PRIVATE calls need not to be synced back to underlying fs
          return 0;
        }
        var buffer = HEAPU8.slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags);
      },
  getStreamFromFD(fd) {
        var stream = FS.getStreamChecked(fd);
        return stream;
      },
  varargs:undefined,
  getStr(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },
  };
  function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (cmd) {
        case 0: {
          var arg = syscallGetVarargI();
          if (arg < 0) {
            return -28;
          }
          while (FS.streams[arg]) {
            arg++;
          }
          var newStream;
          newStream = FS.dupStream(stream, arg);
          return newStream.fd;
        }
        case 1:
        case 2:
          return 0;  // FD_CLOEXEC makes no sense for a single process.
        case 3:
          return stream.flags;
        case 4: {
          var arg = syscallGetVarargI();
          stream.flags |= arg;
          return 0;
        }
        case 12: {
          var arg = syscallGetVarargP();
          var offset = 0;
          // We're always unlocked.
          HEAP16[(((arg)+(offset))>>1)] = 2;
          return 0;
        }
        case 13:
        case 14:
          return 0; // Pretend that the locking is successful.
      }
      return -28;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_fstat64(fd, buf) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      return SYSCALLS.doStat(FS.stat, stream.path, buf);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  var convertI32PairToI53Checked = (lo, hi) => {
      assert(lo == (lo >>> 0) || lo == (lo|0)); // lo should either be a i32 or a u32
      assert(hi === (hi|0));                    // hi should be a i32
      return ((hi + 0x200000) >>> 0 < 0x400001 - !!lo) ? (lo >>> 0) + hi * 4294967296 : NaN;
    };
  function ___syscall_ftruncate64(fd,length_low, length_high) {
    var length = convertI32PairToI53Checked(length_low, length_high);
  
    
  try {
  
      if (isNaN(length)) return 61;
      FS.ftruncate(fd, length);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  ;
  }

  var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
    };
  
  function ___syscall_getdents64(fd, dirp, count) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd)
      stream.getdents ||= FS.readdir(stream.path);
  
      var struct_size = 280;
      var pos = 0;
      var off = FS.llseek(stream, 0, 1);
  
      var idx = Math.floor(off / struct_size);
  
      while (idx < stream.getdents.length && pos + struct_size <= count) {
        var id;
        var type;
        var name = stream.getdents[idx];
        if (name === '.') {
          id = stream.node.id;
          type = 4; // DT_DIR
        }
        else if (name === '..') {
          var lookup = FS.lookupPath(stream.path, { parent: true });
          id = lookup.node.id;
          type = 4; // DT_DIR
        }
        else {
          var child = FS.lookupNode(stream.node, name);
          id = child.id;
          type = FS.isChrdev(child.mode) ? 2 :  // DT_CHR, character device.
                 FS.isDir(child.mode) ? 4 :     // DT_DIR, directory.
                 FS.isLink(child.mode) ? 10 :   // DT_LNK, symbolic link.
                 8;                             // DT_REG, regular file.
        }
        assert(id);
        (tempI64 = [id>>>0,(tempDouble = id,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[((dirp + pos)>>2)] = tempI64[0],HEAP32[(((dirp + pos)+(4))>>2)] = tempI64[1]);
        (tempI64 = [(idx + 1) * struct_size>>>0,(tempDouble = (idx + 1) * struct_size,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[(((dirp + pos)+(8))>>2)] = tempI64[0],HEAP32[(((dirp + pos)+(12))>>2)] = tempI64[1]);
        HEAP16[(((dirp + pos)+(16))>>1)] = 280;
        HEAP8[(dirp + pos)+(18)] = type;
        stringToUTF8(name, dirp + pos + 19, 256);
        pos += struct_size;
        idx += 1;
      }
      FS.llseek(stream, idx * struct_size, 0);
      return pos;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  
  function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      switch (op) {
        case 21509: {
          if (!stream.tty) return -59;
          return 0;
        }
        case 21505: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcgets) {
            var termios = stream.tty.ops.ioctl_tcgets(stream);
            var argp = syscallGetVarargP();
            HEAP32[((argp)>>2)] = termios.c_iflag || 0;
            HEAP32[(((argp)+(4))>>2)] = termios.c_oflag || 0;
            HEAP32[(((argp)+(8))>>2)] = termios.c_cflag || 0;
            HEAP32[(((argp)+(12))>>2)] = termios.c_lflag || 0;
            for (var i = 0; i < 32; i++) {
              HEAP8[(argp + i)+(17)] = termios.c_cc[i] || 0;
            }
            return 0;
          }
          return 0;
        }
        case 21510:
        case 21511:
        case 21512: {
          if (!stream.tty) return -59;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tcsets) {
            var argp = syscallGetVarargP();
            var c_iflag = HEAP32[((argp)>>2)];
            var c_oflag = HEAP32[(((argp)+(4))>>2)];
            var c_cflag = HEAP32[(((argp)+(8))>>2)];
            var c_lflag = HEAP32[(((argp)+(12))>>2)];
            var c_cc = []
            for (var i = 0; i < 32; i++) {
              c_cc.push(HEAP8[(argp + i)+(17)]);
            }
            return stream.tty.ops.ioctl_tcsets(stream.tty, op, { c_iflag, c_oflag, c_cflag, c_lflag, c_cc });
          }
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -59;
          var argp = syscallGetVarargP();
          HEAP32[((argp)>>2)] = 0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -59;
          return -28; // not supported
        }
        case 21531: {
          var argp = syscallGetVarargP();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -59;
          if (stream.tty.ops.ioctl_tiocgwinsz) {
            var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
            var argp = syscallGetVarargP();
            HEAP16[((argp)>>1)] = winsize[0];
            HEAP16[(((argp)+(2))>>1)] = winsize[1];
          }
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -59;
          return 0;
        }
        case 21515: {
          if (!stream.tty) return -59;
          return 0;
        }
        default: return -28; // not supported
      }
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_lstat64(path, buf) {
  try {
  
      path = SYSCALLS.getStr(path);
      return SYSCALLS.doStat(FS.lstat, path, buf);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_newfstatat(dirfd, path, buf, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      var nofollow = flags & 256;
      var allowEmpty = flags & 4096;
      flags = flags & (~6400);
      assert(!flags, `unknown flags in __syscall_newfstatat: ${flags}`);
      path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);
      return SYSCALLS.doStat(nofollow ? FS.lstat : FS.stat, path, buf);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  
  function ___syscall_openat(dirfd, path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      var mode = varargs ? syscallGetVarargI() : 0;
      return FS.open(path, flags, mode).fd;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_rmdir(path) {
  try {
  
      path = SYSCALLS.getStr(path);
      FS.rmdir(path);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_stat64(path, buf) {
  try {
  
      path = SYSCALLS.getStr(path);
      return SYSCALLS.doStat(FS.stat, path, buf);
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  function ___syscall_unlinkat(dirfd, path, flags) {
  try {
  
      path = SYSCALLS.getStr(path);
      path = SYSCALLS.calculateAt(dirfd, path);
      if (flags === 0) {
        FS.unlink(path);
      } else if (flags === 512) {
        FS.rmdir(path);
      } else {
        abort('Invalid flags passed to unlinkat');
      }
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return -e.errno;
  }
  }

  var __abort_js = () => {
      abort('native code called abort()');
    };

  var __emscripten_memcpy_js = (dest, src, num) => HEAPU8.copyWithin(dest, src, src + num);

  var __emscripten_throw_longjmp = () => {
      throw Infinity;
    };

  function __gmtime_js(time_low, time_high,tmPtr) {
    var time = convertI32PairToI53Checked(time_low, time_high);
  
    
      var date = new Date(time * 1000);
      HEAP32[((tmPtr)>>2)] = date.getUTCSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getUTCMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getUTCHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getUTCDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getUTCMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getUTCFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getUTCDay();
      var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      var yday = ((date.getTime() - start) / (1000 * 60 * 60 * 24))|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
    ;
  }

  var isLeapYear = (year) => year%4 === 0 && (year%100 !== 0 || year%400 === 0);
  
  var MONTH_DAYS_LEAP_CUMULATIVE = [0,31,60,91,121,152,182,213,244,274,305,335];
  
  var MONTH_DAYS_REGULAR_CUMULATIVE = [0,31,59,90,120,151,181,212,243,273,304,334];
  var ydayFromDate = (date) => {
      var leap = isLeapYear(date.getFullYear());
      var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
      var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1
  
      return yday;
    };
  
  function __localtime_js(time_low, time_high,tmPtr) {
    var time = convertI32PairToI53Checked(time_low, time_high);
  
    
      var date = new Date(time*1000);
      HEAP32[((tmPtr)>>2)] = date.getSeconds();
      HEAP32[(((tmPtr)+(4))>>2)] = date.getMinutes();
      HEAP32[(((tmPtr)+(8))>>2)] = date.getHours();
      HEAP32[(((tmPtr)+(12))>>2)] = date.getDate();
      HEAP32[(((tmPtr)+(16))>>2)] = date.getMonth();
      HEAP32[(((tmPtr)+(20))>>2)] = date.getFullYear()-1900;
      HEAP32[(((tmPtr)+(24))>>2)] = date.getDay();
  
      var yday = ydayFromDate(date)|0;
      HEAP32[(((tmPtr)+(28))>>2)] = yday;
      HEAP32[(((tmPtr)+(36))>>2)] = -(date.getTimezoneOffset() * 60);
  
      // Attention: DST is in December in South, and some regions don't have DST at all.
      var start = new Date(date.getFullYear(), 0, 1);
      var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
      var winterOffset = start.getTimezoneOffset();
      var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset))|0;
      HEAP32[(((tmPtr)+(32))>>2)] = dst;
    ;
  }

  
  var __tzset_js = (timezone, daylight, std_name, dst_name) => {
      // TODO: Use (malleable) environment variables instead of system settings.
      var currentYear = new Date().getFullYear();
      var winter = new Date(currentYear, 0, 1);
      var summer = new Date(currentYear, 6, 1);
      var winterOffset = winter.getTimezoneOffset();
      var summerOffset = summer.getTimezoneOffset();
  
      // Local standard timezone offset. Local standard time is not adjusted for
      // daylight savings.  This code uses the fact that getTimezoneOffset returns
      // a greater value during Standard Time versus Daylight Saving Time (DST).
      // Thus it determines the expected output during Standard Time, and it
      // compares whether the output of the given date the same (Standard) or less
      // (DST).
      var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
  
      // timezone is specified as seconds west of UTC ("The external variable
      // `timezone` shall be set to the difference, in seconds, between
      // Coordinated Universal Time (UTC) and local standard time."), the same
      // as returned by stdTimezoneOffset.
      // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
      HEAPU32[((timezone)>>2)] = stdTimezoneOffset * 60;
  
      HEAP32[((daylight)>>2)] = Number(winterOffset != summerOffset);
  
      var extractZone = (timezoneOffset) => {
        // Why inverse sign?
        // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
        var sign = timezoneOffset >= 0 ? "-" : "+";
  
        var absOffset = Math.abs(timezoneOffset)
        var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
        var minutes = String(absOffset % 60).padStart(2, "0");
  
        return `UTC${sign}${hours}${minutes}`;
      }
  
      var winterName = extractZone(winterOffset);
      var summerName = extractZone(summerOffset);
      assert(winterName);
      assert(summerName);
      assert(lengthBytesUTF8(winterName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${winterName})`);
      assert(lengthBytesUTF8(summerName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${summerName})`);
      if (summerOffset < winterOffset) {
        // Northern hemisphere
        stringToUTF8(winterName, std_name, 17);
        stringToUTF8(summerName, dst_name, 17);
      } else {
        stringToUTF8(winterName, dst_name, 17);
        stringToUTF8(summerName, std_name, 17);
      }
    };

  var _emscripten_date_now = () => Date.now();

  var getHeapMax = () =>
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648;
  
  
  var growMemory = (size) => {
      var b = wasmMemory.buffer;
      var pages = ((size - b.byteLength + 65535) / 65536) | 0;
      try {
        // round size grow request up to wasm page size (fixed 64KB per spec)
        wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
        updateMemoryViews();
        return 1 /*success*/;
      } catch(e) {
        err(`growMemory: Attempted to grow heap from ${b.byteLength} bytes to ${size} bytes, but got error: ${e}`);
      }
      // implicit 0 return to save code size (caller will cast "undefined" into 0
      // anyhow)
    };
  var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length;
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0;
      // With multithreaded builds, races can happen (another thread might increase the size
      // in between), so return a failure, and let the caller retry.
      assert(requestedSize > oldSize);
  
      // Memory resize rules:
      // 1.  Always increase heap size to at least the requested size, rounded up
      //     to next page multiple.
      // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
      //     geometrically: increase the heap size according to
      //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
      //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
      // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
      //     linearly: increase the heap size by at least
      //     MEMORY_GROWTH_LINEAR_STEP bytes.
      // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
      //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
      // 4.  If we were unable to allocate as much memory, it may be due to
      //     over-eager decision to excessively reserve due to (3) above.
      //     Hence if an allocation fails, cut down on the amount of excess
      //     growth, in an attempt to succeed to perform a smaller allocation.
  
      // A limit is set for how much we can grow. We should not exceed that
      // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
        return false;
      }
  
      // Loop through potential heap size increases. If we attempt a too eager
      // reservation that fails, cut down on the attempted size and reserve a
      // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
        // but limit overreserving (default to capping at +96MB overgrowth at most)
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296 );
  
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
  
        var replacement = growMemory(newSize);
        if (replacement) {
  
          return true;
        }
      }
      err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
      return false;
    };

  var ENV = {
  };
  
  var getExecutableName = () => {
      return thisProgram || './this.program';
    };
  var getEnvStrings = () => {
      if (!getEnvStrings.strings) {
        // Default values.
        // Browser language detection #8751
        var lang = ((typeof navigator == 'object' && navigator.languages && navigator.languages[0]) || 'C').replace('-', '_') + '.UTF-8';
        var env = {
          'USER': 'web_user',
          'LOGNAME': 'web_user',
          'PATH': '/',
          'PWD': '/',
          'HOME': '/home/web_user',
          'LANG': lang,
          '_': getExecutableName()
        };
        // Apply the user-provided values, if any.
        for (var x in ENV) {
          // x is a key in ENV; if ENV[x] is undefined, that means it was
          // explicitly set to be so. We allow user code to do that to
          // force variables with default values to remain unset.
          if (ENV[x] === undefined) delete env[x];
          else env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(`${x}=${env[x]}`);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    };
  
  var stringToAscii = (str, buffer) => {
      for (var i = 0; i < str.length; ++i) {
        assert(str.charCodeAt(i) === (str.charCodeAt(i) & 0xff));
        HEAP8[buffer++] = str.charCodeAt(i);
      }
      // Null-terminate the string
      HEAP8[buffer] = 0;
    };
  var _environ_get = (__environ, environ_buf) => {
      var bufSize = 0;
      getEnvStrings().forEach((string, i) => {
        var ptr = environ_buf + bufSize;
        HEAPU32[(((__environ)+(i*4))>>2)] = ptr;
        stringToAscii(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    };

  var _environ_sizes_get = (penviron_count, penviron_buf_size) => {
      var strings = getEnvStrings();
      HEAPU32[((penviron_count)>>2)] = strings.length;
      var bufSize = 0;
      strings.forEach((string) => bufSize += string.length + 1);
      HEAPU32[((penviron_buf_size)>>2)] = bufSize;
      return 0;
    };

  function _fd_close(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  /** @param {number=} offset */
  var doReadv = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        var curr = FS.read(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) break; // nothing more to read
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  function _fd_read(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doReadv(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  
  function _fd_seek(fd,offset_low, offset_high,whence,newOffset) {
    var offset = convertI32PairToI53Checked(offset_low, offset_high);
  
    
  try {
  
      if (isNaN(offset)) return 61;
      var stream = SYSCALLS.getStreamFromFD(fd);
      FS.llseek(stream, offset, whence);
      (tempI64 = [stream.position>>>0,(tempDouble = stream.position,(+(Math.abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? (+(Math.floor((tempDouble)/4294967296.0)))>>>0 : (~~((+(Math.ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)], HEAP32[((newOffset)>>2)] = tempI64[0],HEAP32[(((newOffset)+(4))>>2)] = tempI64[1]);
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  ;
  }

  function _fd_sync(fd) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      if (stream.stream_ops?.fsync) {
        return stream.stream_ops.fsync(stream);
      }
      return 0; // we can't do anything synchronously; the in-memory FS is already synced to
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  /** @param {number=} offset */
  var doWritev = (stream, iov, iovcnt, offset) => {
      var ret = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[((iov)>>2)];
        var len = HEAPU32[(((iov)+(4))>>2)];
        iov += 8;
        var curr = FS.write(stream, HEAP8, ptr, len, offset);
        if (curr < 0) return -1;
        ret += curr;
        if (curr < len) {
          // No more space to write.
          break;
        }
        if (typeof offset != 'undefined') {
          offset += curr;
        }
      }
      return ret;
    };
  
  function _fd_write(fd, iov, iovcnt, pnum) {
  try {
  
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = doWritev(stream, iov, iovcnt);
      HEAPU32[((pnum)>>2)] = num;
      return 0;
    } catch (e) {
    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;
    return e.errno;
  }
  }

  var wasmTableMirror = [];
  
  /** @type {WebAssembly.Table} */
  var wasmTable;
  var getWasmTableEntry = (funcPtr) => {
      var func = wasmTableMirror[funcPtr];
      if (!func) {
        if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
      }
      assert(wasmTable.get(funcPtr) == func, 'JavaScript-side Wasm function table mirror is out of date!');
      return func;
    };

  var UTF16Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf-16le') : undefined;;
  var UTF16ToString = (ptr, maxBytesToRead) => {
      assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
      var endPtr = ptr;
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // Also, use the length info to avoid running tiny strings through
      // TextDecoder, since .subarray() allocates garbage.
      var idx = endPtr >> 1;
      var maxIdx = idx + maxBytesToRead / 2;
      // If maxBytesToRead is not passed explicitly, it will be undefined, and this
      // will always evaluate to true. This saves on code size.
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx;
      endPtr = idx << 1;
  
      if (endPtr - ptr > 32 && UTF16Decoder)
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  
      // Fallback: decode without UTF16Decoder
      var str = '';
  
      // If maxBytesToRead is not passed explicitly, it will be undefined, and the
      // for-loop's condition will always evaluate to true. The loop is then
      // terminated on the first null char.
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
        if (codeUnit == 0) break;
        // fromCharCode constructs a character from a UTF-16 code unit, so we can
        // pass the UTF16 string right through.
        str += String.fromCharCode(codeUnit);
      }
  
      return str;
    };


  var uleb128Encode = (n, target) => {
      assert(n < 16384);
      if (n < 128) {
        target.push(n);
      } else {
        target.push((n % 128) | 128, n >> 7);
      }
    };
  
  var sigToWasmTypes = (sig) => {
      assert(!sig.includes('j'), 'i64 not permitted in function signatures when WASM_BIGINT is disabled');
      var typeNames = {
        'i': 'i32',
        'j': 'i64',
        'f': 'f32',
        'd': 'f64',
        'e': 'externref',
        'p': 'i32',
      };
      var type = {
        parameters: [],
        results: sig[0] == 'v' ? [] : [typeNames[sig[0]]]
      };
      for (var i = 1; i < sig.length; ++i) {
        assert(sig[i] in typeNames, 'invalid signature char: ' + sig[i]);
        type.parameters.push(typeNames[sig[i]]);
      }
      return type;
    };
  
  var generateFuncType = (sig, target) => {
      var sigRet = sig.slice(0, 1);
      var sigParam = sig.slice(1);
      var typeCodes = {
        'i': 0x7f, // i32
        'p': 0x7f, // i32
        'j': 0x7e, // i64
        'f': 0x7d, // f32
        'd': 0x7c, // f64
        'e': 0x6f, // externref
      };
  
      // Parameters, length + signatures
      target.push(0x60 /* form: func */);
      uleb128Encode(sigParam.length, target);
      for (var i = 0; i < sigParam.length; ++i) {
        assert(sigParam[i] in typeCodes, 'invalid signature char: ' + sigParam[i]);
        target.push(typeCodes[sigParam[i]]);
      }
  
      // Return values, length + signatures
      // With no multi-return in MVP, either 0 (void) or 1 (anything else)
      if (sigRet == 'v') {
        target.push(0x00);
      } else {
        target.push(0x01, typeCodes[sigRet]);
      }
    };
  var convertJsFunctionToWasm = (func, sig) => {
  
      assert(!sig.includes('j'), 'i64 not permitted in function signatures when WASM_BIGINT is disabled');
  
      // If the type reflection proposal is available, use the new
      // "WebAssembly.Function" constructor.
      // Otherwise, construct a minimal wasm module importing the JS function and
      // re-exporting it.
      if (typeof WebAssembly.Function == "function") {
        return new WebAssembly.Function(sigToWasmTypes(sig), func);
      }
  
      // The module is static, with the exception of the type section, which is
      // generated based on the signature passed in.
      var typeSectionBody = [
        0x01, // count: 1
      ];
      generateFuncType(sig, typeSectionBody);
  
      // Rest of the module is static
      var bytes = [
        0x00, 0x61, 0x73, 0x6d, // magic ("\0asm")
        0x01, 0x00, 0x00, 0x00, // version: 1
        0x01, // Type section code
      ];
      // Write the overall length of the type section followed by the body
      uleb128Encode(typeSectionBody.length, bytes);
      bytes.push(...typeSectionBody);
  
      // The rest of the module is static
      bytes.push(
        0x02, 0x07, // import section
          // (import "e" "f" (func 0 (type 0)))
          0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
        0x07, 0x05, // export section
          // (export "f" (func 0 (type 0)))
          0x01, 0x01, 0x66, 0x00, 0x00,
      );
  
      // We can compile this wasm module synchronously because it is very small.
      // This accepts an import (at "e.f"), that it reroutes to an export (at "f")
      var module = new WebAssembly.Module(new Uint8Array(bytes));
      var instance = new WebAssembly.Instance(module, { 'e': { 'f': func } });
      var wrappedFunc = instance.exports['f'];
      return wrappedFunc;
    };
  
  
  var updateTableMap = (offset, count) => {
      if (functionsInTableMap) {
        for (var i = offset; i < offset + count; i++) {
          var item = getWasmTableEntry(i);
          // Ignore null values.
          if (item) {
            functionsInTableMap.set(item, i);
          }
        }
      }
    };
  
  var functionsInTableMap;
  
  var getFunctionAddress = (func) => {
      // First, create the map if this is the first use.
      if (!functionsInTableMap) {
        functionsInTableMap = new WeakMap();
        updateTableMap(0, wasmTable.length);
      }
      return functionsInTableMap.get(func) || 0;
    };
  
  
  var freeTableIndexes = [];
  
  var getEmptyTableSlot = () => {
      // Reuse a free index if there is one, otherwise grow.
      if (freeTableIndexes.length) {
        return freeTableIndexes.pop();
      }
      // Grow the table
      try {
        wasmTable.grow(1);
      } catch (err) {
        if (!(err instanceof RangeError)) {
          throw err;
        }
        throw 'Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.';
      }
      return wasmTable.length - 1;
    };
  
  
  
  var setWasmTableEntry = (idx, func) => {
      wasmTable.set(idx, func);
      // With ABORT_ON_WASM_EXCEPTIONS wasmTable.get is overridden to return wrapped
      // functions so we need to call it here to retrieve the potential wrapper correctly
      // instead of just storing 'func' directly into wasmTableMirror
      wasmTableMirror[idx] = wasmTable.get(idx);
    };
  
  /** @param {string=} sig */
  var addFunction = (func, sig) => {
      assert(typeof func != 'undefined');
      // Check if the function is already in the table, to ensure each function
      // gets a unique index.
      var rtn = getFunctionAddress(func);
      if (rtn) {
        return rtn;
      }
  
      // It's not in the table, add it now.
  
      var ret = getEmptyTableSlot();
  
      // Set the new value.
      try {
        // Attempting to call this with JS function will cause of table.set() to fail
        setWasmTableEntry(ret, func);
      } catch (err) {
        if (!(err instanceof TypeError)) {
          throw err;
        }
        assert(typeof sig != 'undefined', 'Missing signature argument to addFunction: ' + func);
        var wrapped = convertJsFunctionToWasm(func, sig);
        setWasmTableEntry(ret, wrapped);
      }
  
      functionsInTableMap.set(func, ret);
  
      return ret;
    };

  var getCFunc = (ident) => {
      var func = Module['_' + ident]; // closure exported function
      assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
      return func;
    };
  
  var writeArrayToMemory = (array, buffer) => {
      assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
      HEAP8.set(array, buffer);
    };
  
  
  
  var stackAlloc = (sz) => __emscripten_stack_alloc(sz);
  var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    };
  
  
  
  
  
    /**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Arguments|Array=} args
     * @param {Object=} opts
     */
  var ccall = (ident, returnType, argTypes, args, opts) => {
      // For fast lookup of conversion functions
      var toC = {
        'string': (str) => {
          var ret = 0;
          if (str !== null && str !== undefined && str !== 0) { // null string
            ret = stringToUTF8OnStack(str);
          }
          return ret;
        },
        'array': (arr) => {
          var ret = stackAlloc(arr.length);
          writeArrayToMemory(arr, ret);
          return ret;
        }
      };
  
      function convertReturnValue(ret) {
        if (returnType === 'string') {
          return UTF8ToString(ret);
        }
        if (returnType === 'boolean') return Boolean(ret);
        return ret;
      }
  
      var func = getCFunc(ident);
      var cArgs = [];
      var stack = 0;
      assert(returnType !== 'array', 'Return type should not be "array".');
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]];
          if (converter) {
            if (stack === 0) stack = stackSave();
            cArgs[i] = converter(args[i]);
          } else {
            cArgs[i] = args[i];
          }
        }
      }
      var ret = func(...cArgs);
      function onDone(ret) {
        if (stack !== 0) stackRestore(stack);
        return convertReturnValue(ret);
      }
  
      ret = onDone(ret);
      return ret;
    };

  
  
    /**
     * @param {string=} returnType
     * @param {Array=} argTypes
     * @param {Object=} opts
     */
  var cwrap = (ident, returnType, argTypes, opts) => {
      return (...args) => ccall(ident, returnType, argTypes, args, opts);
    };


  
  
  
  
  var removeFunction = (index) => {
      functionsInTableMap.delete(getWasmTableEntry(index));
      setWasmTableEntry(index, null);
      freeTableIndexes.push(index);
    };


  var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
      assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
      // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
      maxBytesToWrite ??= 0x7FFFFFFF;
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2; // Null terminator.
      var startPtr = outPtr;
      var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
      for (var i = 0; i < numCharsToWrite; ++i) {
        // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
        var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
        HEAP16[((outPtr)>>1)] = codeUnit;
        outPtr += 2;
      }
      // Null-terminate the pointer to the HEAP.
      HEAP16[((outPtr)>>1)] = 0;
      return outPtr - startPtr;
    };


  FS.createPreloadedFile = FS_createPreloadedFile;
  FS.staticInit();
  // Set module methods based on EXPORTED_RUNTIME_METHODS
  ;
function checkIncomingModuleAPI() {
  ignoredModuleProp('fetchSettings');
}
var wasmImports = {
  /** @export */
  __assert_fail: ___assert_fail,
  /** @export */
  __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */
  __syscall_fstat64: ___syscall_fstat64,
  /** @export */
  __syscall_ftruncate64: ___syscall_ftruncate64,
  /** @export */
  __syscall_getdents64: ___syscall_getdents64,
  /** @export */
  __syscall_ioctl: ___syscall_ioctl,
  /** @export */
  __syscall_lstat64: ___syscall_lstat64,
  /** @export */
  __syscall_newfstatat: ___syscall_newfstatat,
  /** @export */
  __syscall_openat: ___syscall_openat,
  /** @export */
  __syscall_rmdir: ___syscall_rmdir,
  /** @export */
  __syscall_stat64: ___syscall_stat64,
  /** @export */
  __syscall_unlinkat: ___syscall_unlinkat,
  /** @export */
  _abort_js: __abort_js,
  /** @export */
  _emscripten_memcpy_js: __emscripten_memcpy_js,
  /** @export */
  _emscripten_throw_longjmp: __emscripten_throw_longjmp,
  /** @export */
  _gmtime_js: __gmtime_js,
  /** @export */
  _localtime_js: __localtime_js,
  /** @export */
  _tzset_js: __tzset_js,
  /** @export */
  emscripten_date_now: _emscripten_date_now,
  /** @export */
  emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */
  environ_get: _environ_get,
  /** @export */
  environ_sizes_get: _environ_sizes_get,
  /** @export */
  fd_close: _fd_close,
  /** @export */
  fd_read: _fd_read,
  /** @export */
  fd_seek: _fd_seek,
  /** @export */
  fd_sync: _fd_sync,
  /** @export */
  fd_write: _fd_write,
  /** @export */
  invoke_ii,
  /** @export */
  invoke_iii,
  /** @export */
  invoke_iiii,
  /** @export */
  invoke_iiiii,
  /** @export */
  invoke_v,
  /** @export */
  invoke_vii,
  /** @export */
  invoke_viii,
  /** @export */
  invoke_viiii,
  /** @export */
  invoke_viiiiiiiii
};
var wasmExports = createWasm();
var ___wasm_call_ctors = createExportWrapper('__wasm_call_ctors', 0);
var _PDFiumExt_Init = Module['_PDFiumExt_Init'] = createExportWrapper('PDFiumExt_Init', 0);
var _FPDF_InitLibraryWithConfig = Module['_FPDF_InitLibraryWithConfig'] = createExportWrapper('FPDF_InitLibraryWithConfig', 1);
var _PDFiumExt_OpenFileWriter = Module['_PDFiumExt_OpenFileWriter'] = createExportWrapper('PDFiumExt_OpenFileWriter', 0);
var _PDFiumExt_GetFileWriterSize = Module['_PDFiumExt_GetFileWriterSize'] = createExportWrapper('PDFiumExt_GetFileWriterSize', 1);
var _PDFiumExt_GetFileWriterData = Module['_PDFiumExt_GetFileWriterData'] = createExportWrapper('PDFiumExt_GetFileWriterData', 3);
var _PDFiumExt_CloseFileWriter = Module['_PDFiumExt_CloseFileWriter'] = createExportWrapper('PDFiumExt_CloseFileWriter', 1);
var _PDFiumExt_SaveAsCopy = Module['_PDFiumExt_SaveAsCopy'] = createExportWrapper('PDFiumExt_SaveAsCopy', 2);
var _FPDF_SaveAsCopy = Module['_FPDF_SaveAsCopy'] = createExportWrapper('FPDF_SaveAsCopy', 3);
var _PDFiumExt_OpenFormFillInfo = Module['_PDFiumExt_OpenFormFillInfo'] = createExportWrapper('PDFiumExt_OpenFormFillInfo', 0);
var _PDFiumExt_CloseFormFillInfo = Module['_PDFiumExt_CloseFormFillInfo'] = createExportWrapper('PDFiumExt_CloseFormFillInfo', 1);
var _PDFiumExt_InitFormFillEnvironment = Module['_PDFiumExt_InitFormFillEnvironment'] = createExportWrapper('PDFiumExt_InitFormFillEnvironment', 2);
var _FPDFDOC_InitFormFillEnvironment = Module['_FPDFDOC_InitFormFillEnvironment'] = createExportWrapper('FPDFDOC_InitFormFillEnvironment', 2);
var _PDFiumExt_ExitFormFillEnvironment = Module['_PDFiumExt_ExitFormFillEnvironment'] = createExportWrapper('PDFiumExt_ExitFormFillEnvironment', 1);
var _FPDFDOC_ExitFormFillEnvironment = Module['_FPDFDOC_ExitFormFillEnvironment'] = createExportWrapper('FPDFDOC_ExitFormFillEnvironment', 1);
var _EPDFNamedDest_SetDest = Module['_EPDFNamedDest_SetDest'] = createExportWrapper('EPDFNamedDest_SetDest', 3);
var _EPDFNamedDest_Remove = Module['_EPDFNamedDest_Remove'] = createExportWrapper('EPDFNamedDest_Remove', 2);
var _EPDFDest_CreateView = Module['_EPDFDest_CreateView'] = createExportWrapper('EPDFDest_CreateView', 4);
var _EPDFDest_CreateXYZ = Module['_EPDFDest_CreateXYZ'] = createExportWrapper('EPDFDest_CreateXYZ', 7);
var _EPDFDest_CreateRemoteView = Module['_EPDFDest_CreateRemoteView'] = createExportWrapper('EPDFDest_CreateRemoteView', 5);
var _EPDFDest_CreateRemoteXYZ = Module['_EPDFDest_CreateRemoteXYZ'] = createExportWrapper('EPDFDest_CreateRemoteXYZ', 8);
var _EPDFAction_CreateGoTo = Module['_EPDFAction_CreateGoTo'] = createExportWrapper('EPDFAction_CreateGoTo', 2);
var _EPDFAction_CreateGoToNamed = Module['_EPDFAction_CreateGoToNamed'] = createExportWrapper('EPDFAction_CreateGoToNamed', 2);
var _EPDFAction_CreateLaunch = Module['_EPDFAction_CreateLaunch'] = createExportWrapper('EPDFAction_CreateLaunch', 2);
var _EPDFAction_CreateRemoteGoToByName = Module['_EPDFAction_CreateRemoteGoToByName'] = createExportWrapper('EPDFAction_CreateRemoteGoToByName', 3);
var _EPDFAction_CreateRemoteGoToDest = Module['_EPDFAction_CreateRemoteGoToDest'] = createExportWrapper('EPDFAction_CreateRemoteGoToDest', 3);
var _EPDFAction_CreateURI = Module['_EPDFAction_CreateURI'] = createExportWrapper('EPDFAction_CreateURI', 2);
var _EPDFBookmark_Create = Module['_EPDFBookmark_Create'] = createExportWrapper('EPDFBookmark_Create', 2);
var _EPDFBookmark_Delete = Module['_EPDFBookmark_Delete'] = createExportWrapper('EPDFBookmark_Delete', 2);
var _EPDFBookmark_AppendChild = Module['_EPDFBookmark_AppendChild'] = createExportWrapper('EPDFBookmark_AppendChild', 3);
var _EPDFBookmark_InsertAfter = Module['_EPDFBookmark_InsertAfter'] = createExportWrapper('EPDFBookmark_InsertAfter', 4);
var _EPDFBookmark_Clear = Module['_EPDFBookmark_Clear'] = createExportWrapper('EPDFBookmark_Clear', 1);
var _EPDFBookmark_SetTitle = Module['_EPDFBookmark_SetTitle'] = createExportWrapper('EPDFBookmark_SetTitle', 2);
var _EPDFBookmark_SetDest = Module['_EPDFBookmark_SetDest'] = createExportWrapper('EPDFBookmark_SetDest', 3);
var _EPDFBookmark_SetAction = Module['_EPDFBookmark_SetAction'] = createExportWrapper('EPDFBookmark_SetAction', 3);
var _EPDFBookmark_ClearTarget = Module['_EPDFBookmark_ClearTarget'] = createExportWrapper('EPDFBookmark_ClearTarget', 1);
var _EPDF_PNG_EncodeRGBA = Module['_EPDF_PNG_EncodeRGBA'] = createExportWrapper('EPDF_PNG_EncodeRGBA', 6);
var _FPDFAnnot_IsSupportedSubtype = Module['_FPDFAnnot_IsSupportedSubtype'] = createExportWrapper('FPDFAnnot_IsSupportedSubtype', 1);
var _FPDFPage_CreateAnnot = Module['_FPDFPage_CreateAnnot'] = createExportWrapper('FPDFPage_CreateAnnot', 2);
var _FPDFPage_GetAnnotCount = Module['_FPDFPage_GetAnnotCount'] = createExportWrapper('FPDFPage_GetAnnotCount', 1);
var _FPDFPage_GetAnnot = Module['_FPDFPage_GetAnnot'] = createExportWrapper('FPDFPage_GetAnnot', 2);
var _FPDFPage_GetAnnotIndex = Module['_FPDFPage_GetAnnotIndex'] = createExportWrapper('FPDFPage_GetAnnotIndex', 2);
var _FPDFPage_CloseAnnot = Module['_FPDFPage_CloseAnnot'] = createExportWrapper('FPDFPage_CloseAnnot', 1);
var _FPDFPage_RemoveAnnot = Module['_FPDFPage_RemoveAnnot'] = createExportWrapper('FPDFPage_RemoveAnnot', 2);
var _FPDFAnnot_GetSubtype = Module['_FPDFAnnot_GetSubtype'] = createExportWrapper('FPDFAnnot_GetSubtype', 1);
var _FPDFAnnot_IsObjectSupportedSubtype = Module['_FPDFAnnot_IsObjectSupportedSubtype'] = createExportWrapper('FPDFAnnot_IsObjectSupportedSubtype', 1);
var _FPDFAnnot_UpdateObject = Module['_FPDFAnnot_UpdateObject'] = createExportWrapper('FPDFAnnot_UpdateObject', 2);
var _FPDFAnnot_AddInkStroke = Module['_FPDFAnnot_AddInkStroke'] = createExportWrapper('FPDFAnnot_AddInkStroke', 3);
var _FPDFAnnot_RemoveInkList = Module['_FPDFAnnot_RemoveInkList'] = createExportWrapper('FPDFAnnot_RemoveInkList', 1);
var _FPDFAnnot_AppendObject = Module['_FPDFAnnot_AppendObject'] = createExportWrapper('FPDFAnnot_AppendObject', 2);
var _FPDFAnnot_GetObjectCount = Module['_FPDFAnnot_GetObjectCount'] = createExportWrapper('FPDFAnnot_GetObjectCount', 1);
var _FPDFAnnot_GetObject = Module['_FPDFAnnot_GetObject'] = createExportWrapper('FPDFAnnot_GetObject', 2);
var _FPDFAnnot_RemoveObject = Module['_FPDFAnnot_RemoveObject'] = createExportWrapper('FPDFAnnot_RemoveObject', 2);
var _FPDFAnnot_SetColor = Module['_FPDFAnnot_SetColor'] = createExportWrapper('FPDFAnnot_SetColor', 6);
var _FPDFAnnot_GetColor = Module['_FPDFAnnot_GetColor'] = createExportWrapper('FPDFAnnot_GetColor', 6);
var _FPDFAnnot_HasAttachmentPoints = Module['_FPDFAnnot_HasAttachmentPoints'] = createExportWrapper('FPDFAnnot_HasAttachmentPoints', 1);
var _FPDFAnnot_SetAttachmentPoints = Module['_FPDFAnnot_SetAttachmentPoints'] = createExportWrapper('FPDFAnnot_SetAttachmentPoints', 3);
var _FPDFAnnot_AppendAttachmentPoints = Module['_FPDFAnnot_AppendAttachmentPoints'] = createExportWrapper('FPDFAnnot_AppendAttachmentPoints', 2);
var _FPDFAnnot_CountAttachmentPoints = Module['_FPDFAnnot_CountAttachmentPoints'] = createExportWrapper('FPDFAnnot_CountAttachmentPoints', 1);
var _FPDFAnnot_GetAttachmentPoints = Module['_FPDFAnnot_GetAttachmentPoints'] = createExportWrapper('FPDFAnnot_GetAttachmentPoints', 3);
var _FPDFAnnot_SetRect = Module['_FPDFAnnot_SetRect'] = createExportWrapper('FPDFAnnot_SetRect', 2);
var _FPDFAnnot_GetRect = Module['_FPDFAnnot_GetRect'] = createExportWrapper('FPDFAnnot_GetRect', 2);
var _FPDFAnnot_GetVertices = Module['_FPDFAnnot_GetVertices'] = createExportWrapper('FPDFAnnot_GetVertices', 3);
var _FPDFAnnot_GetInkListCount = Module['_FPDFAnnot_GetInkListCount'] = createExportWrapper('FPDFAnnot_GetInkListCount', 1);
var _FPDFAnnot_GetInkListPath = Module['_FPDFAnnot_GetInkListPath'] = createExportWrapper('FPDFAnnot_GetInkListPath', 4);
var _FPDFAnnot_GetLine = Module['_FPDFAnnot_GetLine'] = createExportWrapper('FPDFAnnot_GetLine', 3);
var _FPDFAnnot_SetBorder = Module['_FPDFAnnot_SetBorder'] = createExportWrapper('FPDFAnnot_SetBorder', 4);
var _FPDFAnnot_GetBorder = Module['_FPDFAnnot_GetBorder'] = createExportWrapper('FPDFAnnot_GetBorder', 4);
var _FPDFAnnot_HasKey = Module['_FPDFAnnot_HasKey'] = createExportWrapper('FPDFAnnot_HasKey', 2);
var _FPDFAnnot_GetValueType = Module['_FPDFAnnot_GetValueType'] = createExportWrapper('FPDFAnnot_GetValueType', 2);
var _FPDFAnnot_SetStringValue = Module['_FPDFAnnot_SetStringValue'] = createExportWrapper('FPDFAnnot_SetStringValue', 3);
var _FPDFAnnot_GetStringValue = Module['_FPDFAnnot_GetStringValue'] = createExportWrapper('FPDFAnnot_GetStringValue', 4);
var _FPDFAnnot_GetNumberValue = Module['_FPDFAnnot_GetNumberValue'] = createExportWrapper('FPDFAnnot_GetNumberValue', 3);
var _FPDFAnnot_SetAP = Module['_FPDFAnnot_SetAP'] = createExportWrapper('FPDFAnnot_SetAP', 3);
var _FPDFAnnot_GetAP = Module['_FPDFAnnot_GetAP'] = createExportWrapper('FPDFAnnot_GetAP', 4);
var _FPDFAnnot_GetLinkedAnnot = Module['_FPDFAnnot_GetLinkedAnnot'] = createExportWrapper('FPDFAnnot_GetLinkedAnnot', 2);
var _FPDFAnnot_GetFlags = Module['_FPDFAnnot_GetFlags'] = createExportWrapper('FPDFAnnot_GetFlags', 1);
var _FPDFAnnot_SetFlags = Module['_FPDFAnnot_SetFlags'] = createExportWrapper('FPDFAnnot_SetFlags', 2);
var _FPDFAnnot_GetFormFieldFlags = Module['_FPDFAnnot_GetFormFieldFlags'] = createExportWrapper('FPDFAnnot_GetFormFieldFlags', 2);
var _FPDFAnnot_SetFormFieldFlags = Module['_FPDFAnnot_SetFormFieldFlags'] = createExportWrapper('FPDFAnnot_SetFormFieldFlags', 3);
var _FPDFAnnot_GetFormFieldAtPoint = Module['_FPDFAnnot_GetFormFieldAtPoint'] = createExportWrapper('FPDFAnnot_GetFormFieldAtPoint', 3);
var _FPDFAnnot_GetFormFieldName = Module['_FPDFAnnot_GetFormFieldName'] = createExportWrapper('FPDFAnnot_GetFormFieldName', 4);
var _FPDFAnnot_GetFormFieldType = Module['_FPDFAnnot_GetFormFieldType'] = createExportWrapper('FPDFAnnot_GetFormFieldType', 2);
var _FPDFAnnot_GetFormAdditionalActionJavaScript = Module['_FPDFAnnot_GetFormAdditionalActionJavaScript'] = createExportWrapper('FPDFAnnot_GetFormAdditionalActionJavaScript', 5);
var _FPDFAnnot_GetFormFieldAlternateName = Module['_FPDFAnnot_GetFormFieldAlternateName'] = createExportWrapper('FPDFAnnot_GetFormFieldAlternateName', 4);
var _FPDFAnnot_GetFormFieldValue = Module['_FPDFAnnot_GetFormFieldValue'] = createExportWrapper('FPDFAnnot_GetFormFieldValue', 4);
var _FPDFAnnot_GetOptionCount = Module['_FPDFAnnot_GetOptionCount'] = createExportWrapper('FPDFAnnot_GetOptionCount', 2);
var _FPDFAnnot_GetOptionLabel = Module['_FPDFAnnot_GetOptionLabel'] = createExportWrapper('FPDFAnnot_GetOptionLabel', 5);
var _FPDFAnnot_IsOptionSelected = Module['_FPDFAnnot_IsOptionSelected'] = createExportWrapper('FPDFAnnot_IsOptionSelected', 3);
var _FPDFAnnot_GetFontSize = Module['_FPDFAnnot_GetFontSize'] = createExportWrapper('FPDFAnnot_GetFontSize', 3);
var _FPDFAnnot_SetFontColor = Module['_FPDFAnnot_SetFontColor'] = createExportWrapper('FPDFAnnot_SetFontColor', 5);
var _FPDFAnnot_GetFontColor = Module['_FPDFAnnot_GetFontColor'] = createExportWrapper('FPDFAnnot_GetFontColor', 5);
var _FPDFAnnot_IsChecked = Module['_FPDFAnnot_IsChecked'] = createExportWrapper('FPDFAnnot_IsChecked', 2);
var _FPDFAnnot_SetFocusableSubtypes = Module['_FPDFAnnot_SetFocusableSubtypes'] = createExportWrapper('FPDFAnnot_SetFocusableSubtypes', 3);
var _FPDFAnnot_GetFocusableSubtypesCount = Module['_FPDFAnnot_GetFocusableSubtypesCount'] = createExportWrapper('FPDFAnnot_GetFocusableSubtypesCount', 1);
var _FPDFAnnot_GetFocusableSubtypes = Module['_FPDFAnnot_GetFocusableSubtypes'] = createExportWrapper('FPDFAnnot_GetFocusableSubtypes', 3);
var _FPDFAnnot_GetLink = Module['_FPDFAnnot_GetLink'] = createExportWrapper('FPDFAnnot_GetLink', 1);
var _FPDFAnnot_GetFormControlCount = Module['_FPDFAnnot_GetFormControlCount'] = createExportWrapper('FPDFAnnot_GetFormControlCount', 2);
var _FPDFAnnot_GetFormControlIndex = Module['_FPDFAnnot_GetFormControlIndex'] = createExportWrapper('FPDFAnnot_GetFormControlIndex', 2);
var _FPDFAnnot_GetFormFieldExportValue = Module['_FPDFAnnot_GetFormFieldExportValue'] = createExportWrapper('FPDFAnnot_GetFormFieldExportValue', 4);
var _FPDFAnnot_SetURI = Module['_FPDFAnnot_SetURI'] = createExportWrapper('FPDFAnnot_SetURI', 2);
var _EPDFAnnot_SetAction = Module['_EPDFAnnot_SetAction'] = createExportWrapper('EPDFAnnot_SetAction', 2);
var _FPDFAnnot_GetFileAttachment = Module['_FPDFAnnot_GetFileAttachment'] = createExportWrapper('FPDFAnnot_GetFileAttachment', 1);
var _FPDFAnnot_AddFileAttachment = Module['_FPDFAnnot_AddFileAttachment'] = createExportWrapper('FPDFAnnot_AddFileAttachment', 2);
var _EPDFAnnot_SetColor = Module['_EPDFAnnot_SetColor'] = createExportWrapper('EPDFAnnot_SetColor', 5);
var _EPDFAnnot_GetColor = Module['_EPDFAnnot_GetColor'] = createExportWrapper('EPDFAnnot_GetColor', 5);
var _EPDFAnnot_ClearColor = Module['_EPDFAnnot_ClearColor'] = createExportWrapper('EPDFAnnot_ClearColor', 2);
var _EPDFAnnot_SetOpacity = Module['_EPDFAnnot_SetOpacity'] = createExportWrapper('EPDFAnnot_SetOpacity', 2);
var _EPDFAnnot_GetOpacity = Module['_EPDFAnnot_GetOpacity'] = createExportWrapper('EPDFAnnot_GetOpacity', 2);
var _EPDFAnnot_GetBorderEffect = Module['_EPDFAnnot_GetBorderEffect'] = createExportWrapper('EPDFAnnot_GetBorderEffect', 2);
var _EPDFAnnot_GetRectangleDifferences = Module['_EPDFAnnot_GetRectangleDifferences'] = createExportWrapper('EPDFAnnot_GetRectangleDifferences', 5);
var _EPDFAnnot_GetBorderDashPatternCount = Module['_EPDFAnnot_GetBorderDashPatternCount'] = createExportWrapper('EPDFAnnot_GetBorderDashPatternCount', 1);
var _EPDFAnnot_GetBorderDashPattern = Module['_EPDFAnnot_GetBorderDashPattern'] = createExportWrapper('EPDFAnnot_GetBorderDashPattern', 3);
var _EPDFAnnot_SetBorderDashPattern = Module['_EPDFAnnot_SetBorderDashPattern'] = createExportWrapper('EPDFAnnot_SetBorderDashPattern', 3);
var _EPDFAnnot_GetBorderStyle = Module['_EPDFAnnot_GetBorderStyle'] = createExportWrapper('EPDFAnnot_GetBorderStyle', 2);
var _EPDFAnnot_SetBorderStyle = Module['_EPDFAnnot_SetBorderStyle'] = createExportWrapper('EPDFAnnot_SetBorderStyle', 3);
var _EPDFAnnot_GenerateAppearance = Module['_EPDFAnnot_GenerateAppearance'] = createExportWrapper('EPDFAnnot_GenerateAppearance', 1);
var _EPDFAnnot_GenerateAppearanceWithBlend = Module['_EPDFAnnot_GenerateAppearanceWithBlend'] = createExportWrapper('EPDFAnnot_GenerateAppearanceWithBlend', 2);
var _EPDFAnnot_GetBlendMode = Module['_EPDFAnnot_GetBlendMode'] = createExportWrapper('EPDFAnnot_GetBlendMode', 1);
var _EPDFAnnot_SetIntent = Module['_EPDFAnnot_SetIntent'] = createExportWrapper('EPDFAnnot_SetIntent', 2);
var _EPDFAnnot_GetIntent = Module['_EPDFAnnot_GetIntent'] = createExportWrapper('EPDFAnnot_GetIntent', 3);
var _EPDFAnnot_GetRichContent = Module['_EPDFAnnot_GetRichContent'] = createExportWrapper('EPDFAnnot_GetRichContent', 3);
var _EPDFAnnot_SetLineEndings = Module['_EPDFAnnot_SetLineEndings'] = createExportWrapper('EPDFAnnot_SetLineEndings', 3);
var _EPDFAnnot_GetLineEndings = Module['_EPDFAnnot_GetLineEndings'] = createExportWrapper('EPDFAnnot_GetLineEndings', 3);
var _EPDFAnnot_SetVertices = Module['_EPDFAnnot_SetVertices'] = createExportWrapper('EPDFAnnot_SetVertices', 3);
var _EPDFAnnot_SetLine = Module['_EPDFAnnot_SetLine'] = createExportWrapper('EPDFAnnot_SetLine', 3);
var _EPDFAnnot_SetDefaultAppearance = Module['_EPDFAnnot_SetDefaultAppearance'] = createExportWrapper('EPDFAnnot_SetDefaultAppearance', 6);
var _EPDFAnnot_GetDefaultAppearance = Module['_EPDFAnnot_GetDefaultAppearance'] = createExportWrapper('EPDFAnnot_GetDefaultAppearance', 6);
var _EPDFAnnot_SetTextAlignment = Module['_EPDFAnnot_SetTextAlignment'] = createExportWrapper('EPDFAnnot_SetTextAlignment', 2);
var _EPDFAnnot_GetTextAlignment = Module['_EPDFAnnot_GetTextAlignment'] = createExportWrapper('EPDFAnnot_GetTextAlignment', 1);
var _EPDFAnnot_SetVerticalAlignment = Module['_EPDFAnnot_SetVerticalAlignment'] = createExportWrapper('EPDFAnnot_SetVerticalAlignment', 2);
var _EPDFAnnot_GetVerticalAlignment = Module['_EPDFAnnot_GetVerticalAlignment'] = createExportWrapper('EPDFAnnot_GetVerticalAlignment', 1);
var _EPDFPage_GetAnnotByName = Module['_EPDFPage_GetAnnotByName'] = createExportWrapper('EPDFPage_GetAnnotByName', 2);
var _EPDFPage_RemoveAnnotByName = Module['_EPDFPage_RemoveAnnotByName'] = createExportWrapper('EPDFPage_RemoveAnnotByName', 2);
var _EPDFAnnot_SetLinkedAnnot = Module['_EPDFAnnot_SetLinkedAnnot'] = createExportWrapper('EPDFAnnot_SetLinkedAnnot', 3);
var _EPDFPage_GetAnnotCountRaw = Module['_EPDFPage_GetAnnotCountRaw'] = createExportWrapper('EPDFPage_GetAnnotCountRaw', 2);
var _EPDFPage_GetAnnotRaw = Module['_EPDFPage_GetAnnotRaw'] = createExportWrapper('EPDFPage_GetAnnotRaw', 3);
var _EPDFPage_RemoveAnnotRaw = Module['_EPDFPage_RemoveAnnotRaw'] = createExportWrapper('EPDFPage_RemoveAnnotRaw', 3);
var _EPDFAnnot_SetIcon = Module['_EPDFAnnot_SetIcon'] = createExportWrapper('EPDFAnnot_SetIcon', 2);
var _EPDFAnnot_GetIcon = Module['_EPDFAnnot_GetIcon'] = createExportWrapper('EPDFAnnot_GetIcon', 1);
var _EPDFAnnot_UpdateAppearanceToRect = Module['_EPDFAnnot_UpdateAppearanceToRect'] = createExportWrapper('EPDFAnnot_UpdateAppearanceToRect', 2);
var _EPDFPage_CreateAnnot = Module['_EPDFPage_CreateAnnot'] = createExportWrapper('EPDFPage_CreateAnnot', 2);
var _EPDFAnnot_SetRotate = Module['_EPDFAnnot_SetRotate'] = createExportWrapper('EPDFAnnot_SetRotate', 2);
var _EPDFAnnot_GetRotate = Module['_EPDFAnnot_GetRotate'] = createExportWrapper('EPDFAnnot_GetRotate', 2);
var _EPDFAnnot_GetReplyType = Module['_EPDFAnnot_GetReplyType'] = createExportWrapper('EPDFAnnot_GetReplyType', 1);
var _EPDFAnnot_SetReplyType = Module['_EPDFAnnot_SetReplyType'] = createExportWrapper('EPDFAnnot_SetReplyType', 2);
var _EPDFAnnot_SetOverlayText = Module['_EPDFAnnot_SetOverlayText'] = createExportWrapper('EPDFAnnot_SetOverlayText', 2);
var _EPDFAnnot_GetOverlayText = Module['_EPDFAnnot_GetOverlayText'] = createExportWrapper('EPDFAnnot_GetOverlayText', 3);
var _EPDFAnnot_SetOverlayTextRepeat = Module['_EPDFAnnot_SetOverlayTextRepeat'] = createExportWrapper('EPDFAnnot_SetOverlayTextRepeat', 2);
var _EPDFAnnot_GetOverlayTextRepeat = Module['_EPDFAnnot_GetOverlayTextRepeat'] = createExportWrapper('EPDFAnnot_GetOverlayTextRepeat', 1);
var _EPDFAnnot_ApplyRedaction = Module['_EPDFAnnot_ApplyRedaction'] = createExportWrapper('EPDFAnnot_ApplyRedaction', 2);
var _EPDFPage_ApplyRedactions = Module['_EPDFPage_ApplyRedactions'] = createExportWrapper('EPDFPage_ApplyRedactions', 1);
var _EPDFAnnot_Flatten = Module['_EPDFAnnot_Flatten'] = createExportWrapper('EPDFAnnot_Flatten', 2);
var _EPDFAnnot_SetExtendedRotation = Module['_EPDFAnnot_SetExtendedRotation'] = createExportWrapper('EPDFAnnot_SetExtendedRotation', 2);
var _EPDFAnnot_GetExtendedRotation = Module['_EPDFAnnot_GetExtendedRotation'] = createExportWrapper('EPDFAnnot_GetExtendedRotation', 2);
var _EPDFAnnot_SetUnrotatedRect = Module['_EPDFAnnot_SetUnrotatedRect'] = createExportWrapper('EPDFAnnot_SetUnrotatedRect', 2);
var _EPDFAnnot_GetUnrotatedRect = Module['_EPDFAnnot_GetUnrotatedRect'] = createExportWrapper('EPDFAnnot_GetUnrotatedRect', 2);
var _EPDFAnnot_SetAPMatrix = Module['_EPDFAnnot_SetAPMatrix'] = createExportWrapper('EPDFAnnot_SetAPMatrix', 3);
var _EPDFAnnot_GetAPMatrix = Module['_EPDFAnnot_GetAPMatrix'] = createExportWrapper('EPDFAnnot_GetAPMatrix', 3);
var _FPDFDoc_GetAttachmentCount = Module['_FPDFDoc_GetAttachmentCount'] = createExportWrapper('FPDFDoc_GetAttachmentCount', 1);
var _FPDFDoc_AddAttachment = Module['_FPDFDoc_AddAttachment'] = createExportWrapper('FPDFDoc_AddAttachment', 2);
var _FPDFDoc_GetAttachment = Module['_FPDFDoc_GetAttachment'] = createExportWrapper('FPDFDoc_GetAttachment', 2);
var _FPDFDoc_DeleteAttachment = Module['_FPDFDoc_DeleteAttachment'] = createExportWrapper('FPDFDoc_DeleteAttachment', 2);
var _FPDFAttachment_GetName = Module['_FPDFAttachment_GetName'] = createExportWrapper('FPDFAttachment_GetName', 3);
var _FPDFAttachment_HasKey = Module['_FPDFAttachment_HasKey'] = createExportWrapper('FPDFAttachment_HasKey', 2);
var _FPDFAttachment_GetValueType = Module['_FPDFAttachment_GetValueType'] = createExportWrapper('FPDFAttachment_GetValueType', 2);
var _FPDFAttachment_SetStringValue = Module['_FPDFAttachment_SetStringValue'] = createExportWrapper('FPDFAttachment_SetStringValue', 3);
var _FPDFAttachment_GetStringValue = Module['_FPDFAttachment_GetStringValue'] = createExportWrapper('FPDFAttachment_GetStringValue', 4);
var _FPDFAttachment_SetFile = Module['_FPDFAttachment_SetFile'] = createExportWrapper('FPDFAttachment_SetFile', 4);
var _FPDFAttachment_GetFile = Module['_FPDFAttachment_GetFile'] = createExportWrapper('FPDFAttachment_GetFile', 4);
var _FPDFAttachment_GetSubtype = Module['_FPDFAttachment_GetSubtype'] = createExportWrapper('FPDFAttachment_GetSubtype', 3);
var _EPDFAttachment_SetSubtype = Module['_EPDFAttachment_SetSubtype'] = createExportWrapper('EPDFAttachment_SetSubtype', 2);
var _EPDFAttachment_SetDescription = Module['_EPDFAttachment_SetDescription'] = createExportWrapper('EPDFAttachment_SetDescription', 2);
var _EPDFAttachment_GetDescription = Module['_EPDFAttachment_GetDescription'] = createExportWrapper('EPDFAttachment_GetDescription', 3);
var _EPDFAttachment_GetIntegerValue = Module['_EPDFAttachment_GetIntegerValue'] = createExportWrapper('EPDFAttachment_GetIntegerValue', 3);
var _FPDFCatalog_IsTagged = Module['_FPDFCatalog_IsTagged'] = createExportWrapper('FPDFCatalog_IsTagged', 1);
var _FPDFCatalog_SetLanguage = Module['_FPDFCatalog_SetLanguage'] = createExportWrapper('FPDFCatalog_SetLanguage', 2);
var _EPDFCatalog_GetLanguage = Module['_EPDFCatalog_GetLanguage'] = createExportWrapper('EPDFCatalog_GetLanguage', 3);
var _FPDFAvail_Create = Module['_FPDFAvail_Create'] = createExportWrapper('FPDFAvail_Create', 2);
var _FPDFAvail_Destroy = Module['_FPDFAvail_Destroy'] = createExportWrapper('FPDFAvail_Destroy', 1);
var _FPDFAvail_IsDocAvail = Module['_FPDFAvail_IsDocAvail'] = createExportWrapper('FPDFAvail_IsDocAvail', 2);
var _FPDFAvail_GetDocument = Module['_FPDFAvail_GetDocument'] = createExportWrapper('FPDFAvail_GetDocument', 2);
var _FPDFAvail_GetFirstPageNum = Module['_FPDFAvail_GetFirstPageNum'] = createExportWrapper('FPDFAvail_GetFirstPageNum', 1);
var _FPDFAvail_IsPageAvail = Module['_FPDFAvail_IsPageAvail'] = createExportWrapper('FPDFAvail_IsPageAvail', 3);
var _FPDFAvail_IsFormAvail = Module['_FPDFAvail_IsFormAvail'] = createExportWrapper('FPDFAvail_IsFormAvail', 2);
var _FPDFAvail_IsLinearized = Module['_FPDFAvail_IsLinearized'] = createExportWrapper('FPDFAvail_IsLinearized', 1);
var _FPDFBookmark_GetFirstChild = Module['_FPDFBookmark_GetFirstChild'] = createExportWrapper('FPDFBookmark_GetFirstChild', 2);
var _FPDFBookmark_GetNextSibling = Module['_FPDFBookmark_GetNextSibling'] = createExportWrapper('FPDFBookmark_GetNextSibling', 2);
var _FPDFBookmark_GetTitle = Module['_FPDFBookmark_GetTitle'] = createExportWrapper('FPDFBookmark_GetTitle', 3);
var _FPDFBookmark_GetCount = Module['_FPDFBookmark_GetCount'] = createExportWrapper('FPDFBookmark_GetCount', 1);
var _FPDFBookmark_Find = Module['_FPDFBookmark_Find'] = createExportWrapper('FPDFBookmark_Find', 2);
var _FPDFBookmark_GetDest = Module['_FPDFBookmark_GetDest'] = createExportWrapper('FPDFBookmark_GetDest', 2);
var _FPDFBookmark_GetAction = Module['_FPDFBookmark_GetAction'] = createExportWrapper('FPDFBookmark_GetAction', 1);
var _FPDFAction_GetType = Module['_FPDFAction_GetType'] = createExportWrapper('FPDFAction_GetType', 1);
var _FPDFAction_GetDest = Module['_FPDFAction_GetDest'] = createExportWrapper('FPDFAction_GetDest', 2);
var _FPDFAction_GetFilePath = Module['_FPDFAction_GetFilePath'] = createExportWrapper('FPDFAction_GetFilePath', 3);
var _FPDFAction_GetURIPath = Module['_FPDFAction_GetURIPath'] = createExportWrapper('FPDFAction_GetURIPath', 4);
var _FPDFDest_GetDestPageIndex = Module['_FPDFDest_GetDestPageIndex'] = createExportWrapper('FPDFDest_GetDestPageIndex', 2);
var _FPDFDest_GetView = Module['_FPDFDest_GetView'] = createExportWrapper('FPDFDest_GetView', 3);
var _FPDFDest_GetLocationInPage = Module['_FPDFDest_GetLocationInPage'] = createExportWrapper('FPDFDest_GetLocationInPage', 7);
var _FPDFLink_GetLinkAtPoint = Module['_FPDFLink_GetLinkAtPoint'] = createExportWrapper('FPDFLink_GetLinkAtPoint', 3);
var _FPDFLink_GetLinkZOrderAtPoint = Module['_FPDFLink_GetLinkZOrderAtPoint'] = createExportWrapper('FPDFLink_GetLinkZOrderAtPoint', 3);
var _FPDFLink_GetDest = Module['_FPDFLink_GetDest'] = createExportWrapper('FPDFLink_GetDest', 2);
var _FPDFLink_GetAction = Module['_FPDFLink_GetAction'] = createExportWrapper('FPDFLink_GetAction', 1);
var _FPDFLink_Enumerate = Module['_FPDFLink_Enumerate'] = createExportWrapper('FPDFLink_Enumerate', 3);
var _FPDFLink_GetAnnot = Module['_FPDFLink_GetAnnot'] = createExportWrapper('FPDFLink_GetAnnot', 2);
var _FPDFLink_GetAnnotRect = Module['_FPDFLink_GetAnnotRect'] = createExportWrapper('FPDFLink_GetAnnotRect', 2);
var _FPDFLink_CountQuadPoints = Module['_FPDFLink_CountQuadPoints'] = createExportWrapper('FPDFLink_CountQuadPoints', 1);
var _FPDFLink_GetQuadPoints = Module['_FPDFLink_GetQuadPoints'] = createExportWrapper('FPDFLink_GetQuadPoints', 3);
var _FPDF_GetPageAAction = Module['_FPDF_GetPageAAction'] = createExportWrapper('FPDF_GetPageAAction', 2);
var _FPDF_GetFileIdentifier = Module['_FPDF_GetFileIdentifier'] = createExportWrapper('FPDF_GetFileIdentifier', 4);
var _FPDF_GetMetaText = Module['_FPDF_GetMetaText'] = createExportWrapper('FPDF_GetMetaText', 4);
var _FPDF_GetPageLabel = Module['_FPDF_GetPageLabel'] = createExportWrapper('FPDF_GetPageLabel', 4);
var _EPDF_SetMetaText = Module['_EPDF_SetMetaText'] = createExportWrapper('EPDF_SetMetaText', 3);
var _EPDF_HasMetaText = Module['_EPDF_HasMetaText'] = createExportWrapper('EPDF_HasMetaText', 2);
var _EPDF_GetMetaTrapped = Module['_EPDF_GetMetaTrapped'] = createExportWrapper('EPDF_GetMetaTrapped', 1);
var _EPDF_SetMetaTrapped = Module['_EPDF_SetMetaTrapped'] = createExportWrapper('EPDF_SetMetaTrapped', 2);
var _EPDF_GetMetaKeyCount = Module['_EPDF_GetMetaKeyCount'] = createExportWrapper('EPDF_GetMetaKeyCount', 2);
var _EPDF_GetMetaKeyName = Module['_EPDF_GetMetaKeyName'] = createExportWrapper('EPDF_GetMetaKeyName', 5);
var _FPDFPageObj_NewImageObj = Module['_FPDFPageObj_NewImageObj'] = createExportWrapper('FPDFPageObj_NewImageObj', 1);
var _FPDFImageObj_LoadJpegFile = Module['_FPDFImageObj_LoadJpegFile'] = createExportWrapper('FPDFImageObj_LoadJpegFile', 4);
var _FPDFImageObj_LoadJpegFileInline = Module['_FPDFImageObj_LoadJpegFileInline'] = createExportWrapper('FPDFImageObj_LoadJpegFileInline', 4);
var _FPDFImageObj_SetMatrix = Module['_FPDFImageObj_SetMatrix'] = createExportWrapper('FPDFImageObj_SetMatrix', 7);
var _FPDFImageObj_SetBitmap = Module['_FPDFImageObj_SetBitmap'] = createExportWrapper('FPDFImageObj_SetBitmap', 4);
var _FPDFImageObj_GetBitmap = Module['_FPDFImageObj_GetBitmap'] = createExportWrapper('FPDFImageObj_GetBitmap', 1);
var _FPDFImageObj_GetRenderedBitmap = Module['_FPDFImageObj_GetRenderedBitmap'] = createExportWrapper('FPDFImageObj_GetRenderedBitmap', 3);
var _FPDFImageObj_GetImageDataDecoded = Module['_FPDFImageObj_GetImageDataDecoded'] = createExportWrapper('FPDFImageObj_GetImageDataDecoded', 3);
var _FPDFImageObj_GetImageDataRaw = Module['_FPDFImageObj_GetImageDataRaw'] = createExportWrapper('FPDFImageObj_GetImageDataRaw', 3);
var _FPDFImageObj_GetImageFilterCount = Module['_FPDFImageObj_GetImageFilterCount'] = createExportWrapper('FPDFImageObj_GetImageFilterCount', 1);
var _FPDFImageObj_GetImageFilter = Module['_FPDFImageObj_GetImageFilter'] = createExportWrapper('FPDFImageObj_GetImageFilter', 4);
var _FPDFImageObj_GetImageMetadata = Module['_FPDFImageObj_GetImageMetadata'] = createExportWrapper('FPDFImageObj_GetImageMetadata', 3);
var _FPDFImageObj_GetImagePixelSize = Module['_FPDFImageObj_GetImagePixelSize'] = createExportWrapper('FPDFImageObj_GetImagePixelSize', 3);
var _FPDFImageObj_GetIccProfileDataDecoded = Module['_FPDFImageObj_GetIccProfileDataDecoded'] = createExportWrapper('FPDFImageObj_GetIccProfileDataDecoded', 5);
var _FPDF_CreateNewDocument = Module['_FPDF_CreateNewDocument'] = createExportWrapper('FPDF_CreateNewDocument', 0);
var _FPDFPage_Delete = Module['_FPDFPage_Delete'] = createExportWrapper('FPDFPage_Delete', 2);
var _FPDF_MovePages = Module['_FPDF_MovePages'] = createExportWrapper('FPDF_MovePages', 4);
var _FPDFPage_New = Module['_FPDFPage_New'] = createExportWrapper('FPDFPage_New', 4);
var _FPDFPage_GetRotation = Module['_FPDFPage_GetRotation'] = createExportWrapper('FPDFPage_GetRotation', 1);
var _FPDFPage_InsertObject = Module['_FPDFPage_InsertObject'] = createExportWrapper('FPDFPage_InsertObject', 2);
var _FPDFPage_InsertObjectAtIndex = Module['_FPDFPage_InsertObjectAtIndex'] = createExportWrapper('FPDFPage_InsertObjectAtIndex', 3);
var _FPDFPage_RemoveObject = Module['_FPDFPage_RemoveObject'] = createExportWrapper('FPDFPage_RemoveObject', 2);
var _FPDFPage_CountObjects = Module['_FPDFPage_CountObjects'] = createExportWrapper('FPDFPage_CountObjects', 1);
var _FPDFPage_GetObject = Module['_FPDFPage_GetObject'] = createExportWrapper('FPDFPage_GetObject', 2);
var _FPDFPage_HasTransparency = Module['_FPDFPage_HasTransparency'] = createExportWrapper('FPDFPage_HasTransparency', 1);
var _FPDFPageObj_Destroy = Module['_FPDFPageObj_Destroy'] = createExportWrapper('FPDFPageObj_Destroy', 1);
var _FPDFPageObj_GetMarkedContentID = Module['_FPDFPageObj_GetMarkedContentID'] = createExportWrapper('FPDFPageObj_GetMarkedContentID', 1);
var _FPDFPageObj_CountMarks = Module['_FPDFPageObj_CountMarks'] = createExportWrapper('FPDFPageObj_CountMarks', 1);
var _FPDFPageObj_GetMark = Module['_FPDFPageObj_GetMark'] = createExportWrapper('FPDFPageObj_GetMark', 2);
var _FPDFPageObj_AddMark = Module['_FPDFPageObj_AddMark'] = createExportWrapper('FPDFPageObj_AddMark', 2);
var _FPDFPageObj_RemoveMark = Module['_FPDFPageObj_RemoveMark'] = createExportWrapper('FPDFPageObj_RemoveMark', 2);
var _FPDFPageObjMark_GetName = Module['_FPDFPageObjMark_GetName'] = createExportWrapper('FPDFPageObjMark_GetName', 4);
var _FPDFPageObjMark_CountParams = Module['_FPDFPageObjMark_CountParams'] = createExportWrapper('FPDFPageObjMark_CountParams', 1);
var _FPDFPageObjMark_GetParamKey = Module['_FPDFPageObjMark_GetParamKey'] = createExportWrapper('FPDFPageObjMark_GetParamKey', 5);
var _FPDFPageObjMark_GetParamValueType = Module['_FPDFPageObjMark_GetParamValueType'] = createExportWrapper('FPDFPageObjMark_GetParamValueType', 2);
var _FPDFPageObjMark_GetParamIntValue = Module['_FPDFPageObjMark_GetParamIntValue'] = createExportWrapper('FPDFPageObjMark_GetParamIntValue', 3);
var _FPDFPageObjMark_GetParamStringValue = Module['_FPDFPageObjMark_GetParamStringValue'] = createExportWrapper('FPDFPageObjMark_GetParamStringValue', 5);
var _FPDFPageObjMark_GetParamBlobValue = Module['_FPDFPageObjMark_GetParamBlobValue'] = createExportWrapper('FPDFPageObjMark_GetParamBlobValue', 5);
var _FPDFPageObj_HasTransparency = Module['_FPDFPageObj_HasTransparency'] = createExportWrapper('FPDFPageObj_HasTransparency', 1);
var _FPDFPageObjMark_SetIntParam = Module['_FPDFPageObjMark_SetIntParam'] = createExportWrapper('FPDFPageObjMark_SetIntParam', 5);
var _FPDFPageObjMark_SetStringParam = Module['_FPDFPageObjMark_SetStringParam'] = createExportWrapper('FPDFPageObjMark_SetStringParam', 5);
var _FPDFPageObjMark_SetBlobParam = Module['_FPDFPageObjMark_SetBlobParam'] = createExportWrapper('FPDFPageObjMark_SetBlobParam', 6);
var _FPDFPageObjMark_RemoveParam = Module['_FPDFPageObjMark_RemoveParam'] = createExportWrapper('FPDFPageObjMark_RemoveParam', 3);
var _FPDFPageObj_GetType = Module['_FPDFPageObj_GetType'] = createExportWrapper('FPDFPageObj_GetType', 1);
var _FPDFPageObj_GetIsActive = Module['_FPDFPageObj_GetIsActive'] = createExportWrapper('FPDFPageObj_GetIsActive', 2);
var _FPDFPageObj_SetIsActive = Module['_FPDFPageObj_SetIsActive'] = createExportWrapper('FPDFPageObj_SetIsActive', 2);
var _FPDFPage_GenerateContent = Module['_FPDFPage_GenerateContent'] = createExportWrapper('FPDFPage_GenerateContent', 1);
var _FPDFPageObj_Transform = Module['_FPDFPageObj_Transform'] = createExportWrapper('FPDFPageObj_Transform', 7);
var _FPDFPageObj_TransformF = Module['_FPDFPageObj_TransformF'] = createExportWrapper('FPDFPageObj_TransformF', 2);
var _FPDFPageObj_GetMatrix = Module['_FPDFPageObj_GetMatrix'] = createExportWrapper('FPDFPageObj_GetMatrix', 2);
var _FPDFPageObj_SetMatrix = Module['_FPDFPageObj_SetMatrix'] = createExportWrapper('FPDFPageObj_SetMatrix', 2);
var _FPDFPageObj_SetBlendMode = Module['_FPDFPageObj_SetBlendMode'] = createExportWrapper('FPDFPageObj_SetBlendMode', 2);
var _FPDFPage_TransformAnnots = Module['_FPDFPage_TransformAnnots'] = createExportWrapper('FPDFPage_TransformAnnots', 7);
var _FPDFPage_SetRotation = Module['_FPDFPage_SetRotation'] = createExportWrapper('FPDFPage_SetRotation', 2);
var _FPDFPageObj_SetFillColor = Module['_FPDFPageObj_SetFillColor'] = createExportWrapper('FPDFPageObj_SetFillColor', 5);
var _FPDFPageObj_GetFillColor = Module['_FPDFPageObj_GetFillColor'] = createExportWrapper('FPDFPageObj_GetFillColor', 5);
var _FPDFPageObj_GetBounds = Module['_FPDFPageObj_GetBounds'] = createExportWrapper('FPDFPageObj_GetBounds', 5);
var _FPDFPageObj_GetRotatedBounds = Module['_FPDFPageObj_GetRotatedBounds'] = createExportWrapper('FPDFPageObj_GetRotatedBounds', 2);
var _FPDFPageObj_SetStrokeColor = Module['_FPDFPageObj_SetStrokeColor'] = createExportWrapper('FPDFPageObj_SetStrokeColor', 5);
var _FPDFPageObj_GetStrokeColor = Module['_FPDFPageObj_GetStrokeColor'] = createExportWrapper('FPDFPageObj_GetStrokeColor', 5);
var _FPDFPageObj_SetStrokeWidth = Module['_FPDFPageObj_SetStrokeWidth'] = createExportWrapper('FPDFPageObj_SetStrokeWidth', 2);
var _FPDFPageObj_GetStrokeWidth = Module['_FPDFPageObj_GetStrokeWidth'] = createExportWrapper('FPDFPageObj_GetStrokeWidth', 2);
var _FPDFPageObj_GetLineJoin = Module['_FPDFPageObj_GetLineJoin'] = createExportWrapper('FPDFPageObj_GetLineJoin', 1);
var _FPDFPageObj_SetLineJoin = Module['_FPDFPageObj_SetLineJoin'] = createExportWrapper('FPDFPageObj_SetLineJoin', 2);
var _FPDFPageObj_GetLineCap = Module['_FPDFPageObj_GetLineCap'] = createExportWrapper('FPDFPageObj_GetLineCap', 1);
var _FPDFPageObj_SetLineCap = Module['_FPDFPageObj_SetLineCap'] = createExportWrapper('FPDFPageObj_SetLineCap', 2);
var _FPDFPageObj_GetDashPhase = Module['_FPDFPageObj_GetDashPhase'] = createExportWrapper('FPDFPageObj_GetDashPhase', 2);
var _FPDFPageObj_SetDashPhase = Module['_FPDFPageObj_SetDashPhase'] = createExportWrapper('FPDFPageObj_SetDashPhase', 2);
var _FPDFPageObj_GetDashCount = Module['_FPDFPageObj_GetDashCount'] = createExportWrapper('FPDFPageObj_GetDashCount', 1);
var _FPDFPageObj_GetDashArray = Module['_FPDFPageObj_GetDashArray'] = createExportWrapper('FPDFPageObj_GetDashArray', 3);
var _FPDFPageObj_SetDashArray = Module['_FPDFPageObj_SetDashArray'] = createExportWrapper('FPDFPageObj_SetDashArray', 4);
var _FPDFFormObj_CountObjects = Module['_FPDFFormObj_CountObjects'] = createExportWrapper('FPDFFormObj_CountObjects', 1);
var _FPDFFormObj_GetObject = Module['_FPDFFormObj_GetObject'] = createExportWrapper('FPDFFormObj_GetObject', 2);
var _FPDFFormObj_RemoveObject = Module['_FPDFFormObj_RemoveObject'] = createExportWrapper('FPDFFormObj_RemoveObject', 2);
var _FPDFPageObj_CreateNewPath = Module['_FPDFPageObj_CreateNewPath'] = createExportWrapper('FPDFPageObj_CreateNewPath', 2);
var _FPDFPageObj_CreateNewRect = Module['_FPDFPageObj_CreateNewRect'] = createExportWrapper('FPDFPageObj_CreateNewRect', 4);
var _FPDFPath_CountSegments = Module['_FPDFPath_CountSegments'] = createExportWrapper('FPDFPath_CountSegments', 1);
var _FPDFPath_GetPathSegment = Module['_FPDFPath_GetPathSegment'] = createExportWrapper('FPDFPath_GetPathSegment', 2);
var _FPDFPath_MoveTo = Module['_FPDFPath_MoveTo'] = createExportWrapper('FPDFPath_MoveTo', 3);
var _FPDFPath_LineTo = Module['_FPDFPath_LineTo'] = createExportWrapper('FPDFPath_LineTo', 3);
var _FPDFPath_BezierTo = Module['_FPDFPath_BezierTo'] = createExportWrapper('FPDFPath_BezierTo', 7);
var _FPDFPath_Close = Module['_FPDFPath_Close'] = createExportWrapper('FPDFPath_Close', 1);
var _FPDFPath_SetDrawMode = Module['_FPDFPath_SetDrawMode'] = createExportWrapper('FPDFPath_SetDrawMode', 3);
var _FPDFPath_GetDrawMode = Module['_FPDFPath_GetDrawMode'] = createExportWrapper('FPDFPath_GetDrawMode', 3);
var _FPDFPathSegment_GetPoint = Module['_FPDFPathSegment_GetPoint'] = createExportWrapper('FPDFPathSegment_GetPoint', 3);
var _FPDFPathSegment_GetType = Module['_FPDFPathSegment_GetType'] = createExportWrapper('FPDFPathSegment_GetType', 1);
var _FPDFPathSegment_GetClose = Module['_FPDFPathSegment_GetClose'] = createExportWrapper('FPDFPathSegment_GetClose', 1);
var _FPDFPageObj_NewTextObj = Module['_FPDFPageObj_NewTextObj'] = createExportWrapper('FPDFPageObj_NewTextObj', 3);
var _FPDFText_SetText = Module['_FPDFText_SetText'] = createExportWrapper('FPDFText_SetText', 2);
var _FPDFText_SetCharcodes = Module['_FPDFText_SetCharcodes'] = createExportWrapper('FPDFText_SetCharcodes', 3);
var _FPDFText_LoadFont = Module['_FPDFText_LoadFont'] = createExportWrapper('FPDFText_LoadFont', 5);
var _FPDFText_LoadStandardFont = Module['_FPDFText_LoadStandardFont'] = createExportWrapper('FPDFText_LoadStandardFont', 2);
var _FPDFText_LoadCidType2Font = Module['_FPDFText_LoadCidType2Font'] = createExportWrapper('FPDFText_LoadCidType2Font', 6);
var _FPDFTextObj_GetFontSize = Module['_FPDFTextObj_GetFontSize'] = createExportWrapper('FPDFTextObj_GetFontSize', 2);
var _FPDFTextObj_GetText = Module['_FPDFTextObj_GetText'] = createExportWrapper('FPDFTextObj_GetText', 4);
var _FPDFTextObj_GetRenderedBitmap = Module['_FPDFTextObj_GetRenderedBitmap'] = createExportWrapper('FPDFTextObj_GetRenderedBitmap', 4);
var _FPDFFont_Close = Module['_FPDFFont_Close'] = createExportWrapper('FPDFFont_Close', 1);
var _FPDFPageObj_CreateTextObj = Module['_FPDFPageObj_CreateTextObj'] = createExportWrapper('FPDFPageObj_CreateTextObj', 3);
var _FPDFTextObj_GetTextRenderMode = Module['_FPDFTextObj_GetTextRenderMode'] = createExportWrapper('FPDFTextObj_GetTextRenderMode', 1);
var _FPDFTextObj_SetTextRenderMode = Module['_FPDFTextObj_SetTextRenderMode'] = createExportWrapper('FPDFTextObj_SetTextRenderMode', 2);
var _FPDFTextObj_GetFont = Module['_FPDFTextObj_GetFont'] = createExportWrapper('FPDFTextObj_GetFont', 1);
var _FPDFFont_GetBaseFontName = Module['_FPDFFont_GetBaseFontName'] = createExportWrapper('FPDFFont_GetBaseFontName', 3);
var _FPDFFont_GetFamilyName = Module['_FPDFFont_GetFamilyName'] = createExportWrapper('FPDFFont_GetFamilyName', 3);
var _FPDFFont_GetFontData = Module['_FPDFFont_GetFontData'] = createExportWrapper('FPDFFont_GetFontData', 4);
var _FPDFFont_GetIsEmbedded = Module['_FPDFFont_GetIsEmbedded'] = createExportWrapper('FPDFFont_GetIsEmbedded', 1);
var _FPDFFont_GetFlags = Module['_FPDFFont_GetFlags'] = createExportWrapper('FPDFFont_GetFlags', 1);
var _FPDFFont_GetWeight = Module['_FPDFFont_GetWeight'] = createExportWrapper('FPDFFont_GetWeight', 1);
var _FPDFFont_GetItalicAngle = Module['_FPDFFont_GetItalicAngle'] = createExportWrapper('FPDFFont_GetItalicAngle', 2);
var _FPDFFont_GetAscent = Module['_FPDFFont_GetAscent'] = createExportWrapper('FPDFFont_GetAscent', 3);
var _FPDFFont_GetDescent = Module['_FPDFFont_GetDescent'] = createExportWrapper('FPDFFont_GetDescent', 3);
var _FPDFFont_GetGlyphWidth = Module['_FPDFFont_GetGlyphWidth'] = createExportWrapper('FPDFFont_GetGlyphWidth', 4);
var _FPDFFont_GetGlyphPath = Module['_FPDFFont_GetGlyphPath'] = createExportWrapper('FPDFFont_GetGlyphPath', 3);
var _FPDFGlyphPath_CountGlyphSegments = Module['_FPDFGlyphPath_CountGlyphSegments'] = createExportWrapper('FPDFGlyphPath_CountGlyphSegments', 1);
var _FPDFGlyphPath_GetGlyphPathSegment = Module['_FPDFGlyphPath_GetGlyphPathSegment'] = createExportWrapper('FPDFGlyphPath_GetGlyphPathSegment', 2);
var _EPDFText_RedactInRect = Module['_EPDFText_RedactInRect'] = createExportWrapper('EPDFText_RedactInRect', 4);
var _EPDFText_RedactInQuads = Module['_EPDFText_RedactInQuads'] = createExportWrapper('EPDFText_RedactInQuads', 5);
var _FPDFDoc_GetPageMode = Module['_FPDFDoc_GetPageMode'] = createExportWrapper('FPDFDoc_GetPageMode', 1);
var _FPDFPage_Flatten = Module['_FPDFPage_Flatten'] = createExportWrapper('FPDFPage_Flatten', 2);
var _FPDFPage_HasFormFieldAtPoint = Module['_FPDFPage_HasFormFieldAtPoint'] = createExportWrapper('FPDFPage_HasFormFieldAtPoint', 4);
var _FPDFPage_FormFieldZOrderAtPoint = Module['_FPDFPage_FormFieldZOrderAtPoint'] = createExportWrapper('FPDFPage_FormFieldZOrderAtPoint', 4);
var _malloc = Module['_malloc'] = createExportWrapper('malloc', 1);
var _free = Module['_free'] = createExportWrapper('free', 1);
var _FORM_OnMouseMove = Module['_FORM_OnMouseMove'] = createExportWrapper('FORM_OnMouseMove', 5);
var _FORM_OnMouseWheel = Module['_FORM_OnMouseWheel'] = createExportWrapper('FORM_OnMouseWheel', 6);
var _FORM_OnFocus = Module['_FORM_OnFocus'] = createExportWrapper('FORM_OnFocus', 5);
var _FORM_OnLButtonDown = Module['_FORM_OnLButtonDown'] = createExportWrapper('FORM_OnLButtonDown', 5);
var _FORM_OnLButtonUp = Module['_FORM_OnLButtonUp'] = createExportWrapper('FORM_OnLButtonUp', 5);
var _FORM_OnLButtonDoubleClick = Module['_FORM_OnLButtonDoubleClick'] = createExportWrapper('FORM_OnLButtonDoubleClick', 5);
var _FORM_OnRButtonDown = Module['_FORM_OnRButtonDown'] = createExportWrapper('FORM_OnRButtonDown', 5);
var _FORM_OnRButtonUp = Module['_FORM_OnRButtonUp'] = createExportWrapper('FORM_OnRButtonUp', 5);
var _FORM_OnKeyDown = Module['_FORM_OnKeyDown'] = createExportWrapper('FORM_OnKeyDown', 4);
var _FORM_OnKeyUp = Module['_FORM_OnKeyUp'] = createExportWrapper('FORM_OnKeyUp', 4);
var _FORM_OnChar = Module['_FORM_OnChar'] = createExportWrapper('FORM_OnChar', 4);
var _FORM_GetFocusedText = Module['_FORM_GetFocusedText'] = createExportWrapper('FORM_GetFocusedText', 4);
var _FORM_GetSelectedText = Module['_FORM_GetSelectedText'] = createExportWrapper('FORM_GetSelectedText', 4);
var _FORM_ReplaceAndKeepSelection = Module['_FORM_ReplaceAndKeepSelection'] = createExportWrapper('FORM_ReplaceAndKeepSelection', 3);
var _FORM_ReplaceSelection = Module['_FORM_ReplaceSelection'] = createExportWrapper('FORM_ReplaceSelection', 3);
var _FORM_SelectAllText = Module['_FORM_SelectAllText'] = createExportWrapper('FORM_SelectAllText', 2);
var _FORM_CanUndo = Module['_FORM_CanUndo'] = createExportWrapper('FORM_CanUndo', 2);
var _FORM_CanRedo = Module['_FORM_CanRedo'] = createExportWrapper('FORM_CanRedo', 2);
var _FORM_Undo = Module['_FORM_Undo'] = createExportWrapper('FORM_Undo', 2);
var _FORM_Redo = Module['_FORM_Redo'] = createExportWrapper('FORM_Redo', 2);
var _FORM_ForceToKillFocus = Module['_FORM_ForceToKillFocus'] = createExportWrapper('FORM_ForceToKillFocus', 1);
var _FORM_GetFocusedAnnot = Module['_FORM_GetFocusedAnnot'] = createExportWrapper('FORM_GetFocusedAnnot', 3);
var _FORM_SetFocusedAnnot = Module['_FORM_SetFocusedAnnot'] = createExportWrapper('FORM_SetFocusedAnnot', 2);
var _FPDF_FFLDraw = Module['_FPDF_FFLDraw'] = createExportWrapper('FPDF_FFLDraw', 9);
var _FPDF_SetFormFieldHighlightColor = Module['_FPDF_SetFormFieldHighlightColor'] = createExportWrapper('FPDF_SetFormFieldHighlightColor', 3);
var _FPDF_SetFormFieldHighlightAlpha = Module['_FPDF_SetFormFieldHighlightAlpha'] = createExportWrapper('FPDF_SetFormFieldHighlightAlpha', 2);
var _FPDF_RemoveFormFieldHighlight = Module['_FPDF_RemoveFormFieldHighlight'] = createExportWrapper('FPDF_RemoveFormFieldHighlight', 1);
var _FORM_OnAfterLoadPage = Module['_FORM_OnAfterLoadPage'] = createExportWrapper('FORM_OnAfterLoadPage', 2);
var _FORM_OnBeforeClosePage = Module['_FORM_OnBeforeClosePage'] = createExportWrapper('FORM_OnBeforeClosePage', 2);
var _FORM_DoDocumentJSAction = Module['_FORM_DoDocumentJSAction'] = createExportWrapper('FORM_DoDocumentJSAction', 1);
var _FORM_DoDocumentOpenAction = Module['_FORM_DoDocumentOpenAction'] = createExportWrapper('FORM_DoDocumentOpenAction', 1);
var _FORM_DoDocumentAAction = Module['_FORM_DoDocumentAAction'] = createExportWrapper('FORM_DoDocumentAAction', 2);
var _FORM_DoPageAAction = Module['_FORM_DoPageAAction'] = createExportWrapper('FORM_DoPageAAction', 3);
var _FORM_SetIndexSelected = Module['_FORM_SetIndexSelected'] = createExportWrapper('FORM_SetIndexSelected', 4);
var _FORM_IsIndexSelected = Module['_FORM_IsIndexSelected'] = createExportWrapper('FORM_IsIndexSelected', 3);
var _FPDFDoc_GetJavaScriptActionCount = Module['_FPDFDoc_GetJavaScriptActionCount'] = createExportWrapper('FPDFDoc_GetJavaScriptActionCount', 1);
var _FPDFDoc_GetJavaScriptAction = Module['_FPDFDoc_GetJavaScriptAction'] = createExportWrapper('FPDFDoc_GetJavaScriptAction', 2);
var _FPDFDoc_CloseJavaScriptAction = Module['_FPDFDoc_CloseJavaScriptAction'] = createExportWrapper('FPDFDoc_CloseJavaScriptAction', 1);
var _FPDFJavaScriptAction_GetName = Module['_FPDFJavaScriptAction_GetName'] = createExportWrapper('FPDFJavaScriptAction_GetName', 3);
var _FPDFJavaScriptAction_GetScript = Module['_FPDFJavaScriptAction_GetScript'] = createExportWrapper('FPDFJavaScriptAction_GetScript', 3);
var _FPDF_ImportPagesByIndex = Module['_FPDF_ImportPagesByIndex'] = createExportWrapper('FPDF_ImportPagesByIndex', 5);
var _FPDF_ImportPages = Module['_FPDF_ImportPages'] = createExportWrapper('FPDF_ImportPages', 4);
var _FPDF_ImportNPagesToOne = Module['_FPDF_ImportNPagesToOne'] = createExportWrapper('FPDF_ImportNPagesToOne', 5);
var _FPDF_NewXObjectFromPage = Module['_FPDF_NewXObjectFromPage'] = createExportWrapper('FPDF_NewXObjectFromPage', 3);
var _FPDF_CloseXObject = Module['_FPDF_CloseXObject'] = createExportWrapper('FPDF_CloseXObject', 1);
var _FPDF_NewFormObjectFromXObject = Module['_FPDF_NewFormObjectFromXObject'] = createExportWrapper('FPDF_NewFormObjectFromXObject', 1);
var _FPDF_CopyViewerPreferences = Module['_FPDF_CopyViewerPreferences'] = createExportWrapper('FPDF_CopyViewerPreferences', 2);
var _FPDF_RenderPageBitmapWithColorScheme_Start = Module['_FPDF_RenderPageBitmapWithColorScheme_Start'] = createExportWrapper('FPDF_RenderPageBitmapWithColorScheme_Start', 10);
var _FPDF_RenderPageBitmap_Start = Module['_FPDF_RenderPageBitmap_Start'] = createExportWrapper('FPDF_RenderPageBitmap_Start', 9);
var _FPDF_RenderPage_Continue = Module['_FPDF_RenderPage_Continue'] = createExportWrapper('FPDF_RenderPage_Continue', 2);
var _FPDF_RenderPage_Close = Module['_FPDF_RenderPage_Close'] = createExportWrapper('FPDF_RenderPage_Close', 1);
var _FPDF_SaveWithVersion = Module['_FPDF_SaveWithVersion'] = createExportWrapper('FPDF_SaveWithVersion', 4);
var _FPDFText_GetCharIndexFromTextIndex = Module['_FPDFText_GetCharIndexFromTextIndex'] = createExportWrapper('FPDFText_GetCharIndexFromTextIndex', 2);
var _FPDFText_GetTextIndexFromCharIndex = Module['_FPDFText_GetTextIndexFromCharIndex'] = createExportWrapper('FPDFText_GetTextIndexFromCharIndex', 2);
var _FPDF_GetSignatureCount = Module['_FPDF_GetSignatureCount'] = createExportWrapper('FPDF_GetSignatureCount', 1);
var _FPDF_GetSignatureObject = Module['_FPDF_GetSignatureObject'] = createExportWrapper('FPDF_GetSignatureObject', 2);
var _FPDFSignatureObj_GetContents = Module['_FPDFSignatureObj_GetContents'] = createExportWrapper('FPDFSignatureObj_GetContents', 3);
var _FPDFSignatureObj_GetByteRange = Module['_FPDFSignatureObj_GetByteRange'] = createExportWrapper('FPDFSignatureObj_GetByteRange', 3);
var _FPDFSignatureObj_GetSubFilter = Module['_FPDFSignatureObj_GetSubFilter'] = createExportWrapper('FPDFSignatureObj_GetSubFilter', 3);
var _FPDFSignatureObj_GetReason = Module['_FPDFSignatureObj_GetReason'] = createExportWrapper('FPDFSignatureObj_GetReason', 3);
var _FPDFSignatureObj_GetTime = Module['_FPDFSignatureObj_GetTime'] = createExportWrapper('FPDFSignatureObj_GetTime', 3);
var _FPDFSignatureObj_GetDocMDPPermission = Module['_FPDFSignatureObj_GetDocMDPPermission'] = createExportWrapper('FPDFSignatureObj_GetDocMDPPermission', 1);
var _FPDF_StructTree_GetForPage = Module['_FPDF_StructTree_GetForPage'] = createExportWrapper('FPDF_StructTree_GetForPage', 1);
var _FPDF_StructTree_Close = Module['_FPDF_StructTree_Close'] = createExportWrapper('FPDF_StructTree_Close', 1);
var _FPDF_StructTree_CountChildren = Module['_FPDF_StructTree_CountChildren'] = createExportWrapper('FPDF_StructTree_CountChildren', 1);
var _FPDF_StructTree_GetChildAtIndex = Module['_FPDF_StructTree_GetChildAtIndex'] = createExportWrapper('FPDF_StructTree_GetChildAtIndex', 2);
var _FPDF_StructElement_GetAltText = Module['_FPDF_StructElement_GetAltText'] = createExportWrapper('FPDF_StructElement_GetAltText', 3);
var _FPDF_StructElement_GetActualText = Module['_FPDF_StructElement_GetActualText'] = createExportWrapper('FPDF_StructElement_GetActualText', 3);
var _FPDF_StructElement_GetID = Module['_FPDF_StructElement_GetID'] = createExportWrapper('FPDF_StructElement_GetID', 3);
var _FPDF_StructElement_GetLang = Module['_FPDF_StructElement_GetLang'] = createExportWrapper('FPDF_StructElement_GetLang', 3);
var _FPDF_StructElement_GetAttributeCount = Module['_FPDF_StructElement_GetAttributeCount'] = createExportWrapper('FPDF_StructElement_GetAttributeCount', 1);
var _FPDF_StructElement_GetAttributeAtIndex = Module['_FPDF_StructElement_GetAttributeAtIndex'] = createExportWrapper('FPDF_StructElement_GetAttributeAtIndex', 2);
var _FPDF_StructElement_GetStringAttribute = Module['_FPDF_StructElement_GetStringAttribute'] = createExportWrapper('FPDF_StructElement_GetStringAttribute', 4);
var _FPDF_StructElement_GetMarkedContentID = Module['_FPDF_StructElement_GetMarkedContentID'] = createExportWrapper('FPDF_StructElement_GetMarkedContentID', 1);
var _FPDF_StructElement_GetType = Module['_FPDF_StructElement_GetType'] = createExportWrapper('FPDF_StructElement_GetType', 3);
var _FPDF_StructElement_GetObjType = Module['_FPDF_StructElement_GetObjType'] = createExportWrapper('FPDF_StructElement_GetObjType', 3);
var _FPDF_StructElement_GetTitle = Module['_FPDF_StructElement_GetTitle'] = createExportWrapper('FPDF_StructElement_GetTitle', 3);
var _FPDF_StructElement_CountChildren = Module['_FPDF_StructElement_CountChildren'] = createExportWrapper('FPDF_StructElement_CountChildren', 1);
var _FPDF_StructElement_GetChildAtIndex = Module['_FPDF_StructElement_GetChildAtIndex'] = createExportWrapper('FPDF_StructElement_GetChildAtIndex', 2);
var _FPDF_StructElement_GetChildMarkedContentID = Module['_FPDF_StructElement_GetChildMarkedContentID'] = createExportWrapper('FPDF_StructElement_GetChildMarkedContentID', 2);
var _FPDF_StructElement_GetParent = Module['_FPDF_StructElement_GetParent'] = createExportWrapper('FPDF_StructElement_GetParent', 1);
var _FPDF_StructElement_Attr_GetCount = Module['_FPDF_StructElement_Attr_GetCount'] = createExportWrapper('FPDF_StructElement_Attr_GetCount', 1);
var _FPDF_StructElement_Attr_GetName = Module['_FPDF_StructElement_Attr_GetName'] = createExportWrapper('FPDF_StructElement_Attr_GetName', 5);
var _FPDF_StructElement_Attr_GetValue = Module['_FPDF_StructElement_Attr_GetValue'] = createExportWrapper('FPDF_StructElement_Attr_GetValue', 2);
var _FPDF_StructElement_Attr_GetType = Module['_FPDF_StructElement_Attr_GetType'] = createExportWrapper('FPDF_StructElement_Attr_GetType', 1);
var _FPDF_StructElement_Attr_GetBooleanValue = Module['_FPDF_StructElement_Attr_GetBooleanValue'] = createExportWrapper('FPDF_StructElement_Attr_GetBooleanValue', 2);
var _FPDF_StructElement_Attr_GetNumberValue = Module['_FPDF_StructElement_Attr_GetNumberValue'] = createExportWrapper('FPDF_StructElement_Attr_GetNumberValue', 2);
var _FPDF_StructElement_Attr_GetStringValue = Module['_FPDF_StructElement_Attr_GetStringValue'] = createExportWrapper('FPDF_StructElement_Attr_GetStringValue', 4);
var _FPDF_StructElement_Attr_GetBlobValue = Module['_FPDF_StructElement_Attr_GetBlobValue'] = createExportWrapper('FPDF_StructElement_Attr_GetBlobValue', 4);
var _FPDF_StructElement_Attr_CountChildren = Module['_FPDF_StructElement_Attr_CountChildren'] = createExportWrapper('FPDF_StructElement_Attr_CountChildren', 1);
var _FPDF_StructElement_Attr_GetChildAtIndex = Module['_FPDF_StructElement_Attr_GetChildAtIndex'] = createExportWrapper('FPDF_StructElement_Attr_GetChildAtIndex', 2);
var _FPDF_StructElement_GetMarkedContentIdCount = Module['_FPDF_StructElement_GetMarkedContentIdCount'] = createExportWrapper('FPDF_StructElement_GetMarkedContentIdCount', 1);
var _FPDF_StructElement_GetMarkedContentIdAtIndex = Module['_FPDF_StructElement_GetMarkedContentIdAtIndex'] = createExportWrapper('FPDF_StructElement_GetMarkedContentIdAtIndex', 2);
var _FPDF_AddInstalledFont = Module['_FPDF_AddInstalledFont'] = createExportWrapper('FPDF_AddInstalledFont', 3);
var _FPDF_SetSystemFontInfo = Module['_FPDF_SetSystemFontInfo'] = createExportWrapper('FPDF_SetSystemFontInfo', 1);
var _FPDF_GetDefaultTTFMap = Module['_FPDF_GetDefaultTTFMap'] = createExportWrapper('FPDF_GetDefaultTTFMap', 0);
var _FPDF_GetDefaultTTFMapCount = Module['_FPDF_GetDefaultTTFMapCount'] = createExportWrapper('FPDF_GetDefaultTTFMapCount', 0);
var _FPDF_GetDefaultTTFMapEntry = Module['_FPDF_GetDefaultTTFMapEntry'] = createExportWrapper('FPDF_GetDefaultTTFMapEntry', 1);
var _FPDF_GetDefaultSystemFontInfo = Module['_FPDF_GetDefaultSystemFontInfo'] = createExportWrapper('FPDF_GetDefaultSystemFontInfo', 0);
var _FPDF_FreeDefaultSystemFontInfo = Module['_FPDF_FreeDefaultSystemFontInfo'] = createExportWrapper('FPDF_FreeDefaultSystemFontInfo', 1);
var _FPDFText_LoadPage = Module['_FPDFText_LoadPage'] = createExportWrapper('FPDFText_LoadPage', 1);
var _FPDFText_ClosePage = Module['_FPDFText_ClosePage'] = createExportWrapper('FPDFText_ClosePage', 1);
var _FPDFText_CountChars = Module['_FPDFText_CountChars'] = createExportWrapper('FPDFText_CountChars', 1);
var _FPDFText_GetUnicode = Module['_FPDFText_GetUnicode'] = createExportWrapper('FPDFText_GetUnicode', 2);
var _FPDFText_GetTextObject = Module['_FPDFText_GetTextObject'] = createExportWrapper('FPDFText_GetTextObject', 2);
var _FPDFText_IsGenerated = Module['_FPDFText_IsGenerated'] = createExportWrapper('FPDFText_IsGenerated', 2);
var _FPDFText_IsHyphen = Module['_FPDFText_IsHyphen'] = createExportWrapper('FPDFText_IsHyphen', 2);
var _FPDFText_HasUnicodeMapError = Module['_FPDFText_HasUnicodeMapError'] = createExportWrapper('FPDFText_HasUnicodeMapError', 2);
var _FPDFText_GetFontSize = Module['_FPDFText_GetFontSize'] = createExportWrapper('FPDFText_GetFontSize', 2);
var _FPDFText_GetFontInfo = Module['_FPDFText_GetFontInfo'] = createExportWrapper('FPDFText_GetFontInfo', 5);
var _FPDFText_GetFontWeight = Module['_FPDFText_GetFontWeight'] = createExportWrapper('FPDFText_GetFontWeight', 2);
var _FPDFText_GetFillColor = Module['_FPDFText_GetFillColor'] = createExportWrapper('FPDFText_GetFillColor', 6);
var _FPDFText_GetStrokeColor = Module['_FPDFText_GetStrokeColor'] = createExportWrapper('FPDFText_GetStrokeColor', 6);
var _FPDFText_GetCharAngle = Module['_FPDFText_GetCharAngle'] = createExportWrapper('FPDFText_GetCharAngle', 2);
var _FPDFText_GetCharBox = Module['_FPDFText_GetCharBox'] = createExportWrapper('FPDFText_GetCharBox', 6);
var _FPDFText_GetLooseCharBox = Module['_FPDFText_GetLooseCharBox'] = createExportWrapper('FPDFText_GetLooseCharBox', 3);
var _FPDFText_GetMatrix = Module['_FPDFText_GetMatrix'] = createExportWrapper('FPDFText_GetMatrix', 3);
var _FPDFText_GetCharOrigin = Module['_FPDFText_GetCharOrigin'] = createExportWrapper('FPDFText_GetCharOrigin', 4);
var _FPDFText_GetCharIndexAtPos = Module['_FPDFText_GetCharIndexAtPos'] = createExportWrapper('FPDFText_GetCharIndexAtPos', 5);
var _FPDFText_GetText = Module['_FPDFText_GetText'] = createExportWrapper('FPDFText_GetText', 4);
var _FPDFText_CountRects = Module['_FPDFText_CountRects'] = createExportWrapper('FPDFText_CountRects', 3);
var _FPDFText_GetRect = Module['_FPDFText_GetRect'] = createExportWrapper('FPDFText_GetRect', 6);
var _FPDFText_GetBoundedText = Module['_FPDFText_GetBoundedText'] = createExportWrapper('FPDFText_GetBoundedText', 7);
var _FPDFText_FindStart = Module['_FPDFText_FindStart'] = createExportWrapper('FPDFText_FindStart', 4);
var _FPDFText_FindNext = Module['_FPDFText_FindNext'] = createExportWrapper('FPDFText_FindNext', 1);
var _FPDFText_FindPrev = Module['_FPDFText_FindPrev'] = createExportWrapper('FPDFText_FindPrev', 1);
var _FPDFText_GetSchResultIndex = Module['_FPDFText_GetSchResultIndex'] = createExportWrapper('FPDFText_GetSchResultIndex', 1);
var _FPDFText_GetSchCount = Module['_FPDFText_GetSchCount'] = createExportWrapper('FPDFText_GetSchCount', 1);
var _FPDFText_FindClose = Module['_FPDFText_FindClose'] = createExportWrapper('FPDFText_FindClose', 1);
var _FPDFLink_LoadWebLinks = Module['_FPDFLink_LoadWebLinks'] = createExportWrapper('FPDFLink_LoadWebLinks', 1);
var _FPDFLink_CountWebLinks = Module['_FPDFLink_CountWebLinks'] = createExportWrapper('FPDFLink_CountWebLinks', 1);
var _FPDFLink_GetURL = Module['_FPDFLink_GetURL'] = createExportWrapper('FPDFLink_GetURL', 4);
var _FPDFLink_CountRects = Module['_FPDFLink_CountRects'] = createExportWrapper('FPDFLink_CountRects', 2);
var _FPDFLink_GetRect = Module['_FPDFLink_GetRect'] = createExportWrapper('FPDFLink_GetRect', 7);
var _FPDFLink_GetTextRange = Module['_FPDFLink_GetTextRange'] = createExportWrapper('FPDFLink_GetTextRange', 4);
var _FPDFLink_CloseWebLinks = Module['_FPDFLink_CloseWebLinks'] = createExportWrapper('FPDFLink_CloseWebLinks', 1);
var _FPDFPage_GetDecodedThumbnailData = Module['_FPDFPage_GetDecodedThumbnailData'] = createExportWrapper('FPDFPage_GetDecodedThumbnailData', 3);
var _FPDFPage_GetRawThumbnailData = Module['_FPDFPage_GetRawThumbnailData'] = createExportWrapper('FPDFPage_GetRawThumbnailData', 3);
var _FPDFPage_GetThumbnailAsBitmap = Module['_FPDFPage_GetThumbnailAsBitmap'] = createExportWrapper('FPDFPage_GetThumbnailAsBitmap', 1);
var _FPDFPage_SetMediaBox = Module['_FPDFPage_SetMediaBox'] = createExportWrapper('FPDFPage_SetMediaBox', 5);
var _FPDFPage_SetCropBox = Module['_FPDFPage_SetCropBox'] = createExportWrapper('FPDFPage_SetCropBox', 5);
var _FPDFPage_SetBleedBox = Module['_FPDFPage_SetBleedBox'] = createExportWrapper('FPDFPage_SetBleedBox', 5);
var _FPDFPage_SetTrimBox = Module['_FPDFPage_SetTrimBox'] = createExportWrapper('FPDFPage_SetTrimBox', 5);
var _FPDFPage_SetArtBox = Module['_FPDFPage_SetArtBox'] = createExportWrapper('FPDFPage_SetArtBox', 5);
var _FPDFPage_GetMediaBox = Module['_FPDFPage_GetMediaBox'] = createExportWrapper('FPDFPage_GetMediaBox', 5);
var _FPDFPage_GetCropBox = Module['_FPDFPage_GetCropBox'] = createExportWrapper('FPDFPage_GetCropBox', 5);
var _FPDFPage_GetBleedBox = Module['_FPDFPage_GetBleedBox'] = createExportWrapper('FPDFPage_GetBleedBox', 5);
var _FPDFPage_GetTrimBox = Module['_FPDFPage_GetTrimBox'] = createExportWrapper('FPDFPage_GetTrimBox', 5);
var _FPDFPage_GetArtBox = Module['_FPDFPage_GetArtBox'] = createExportWrapper('FPDFPage_GetArtBox', 5);
var _FPDFPage_TransFormWithClip = Module['_FPDFPage_TransFormWithClip'] = createExportWrapper('FPDFPage_TransFormWithClip', 3);
var _FPDFPageObj_TransformClipPath = Module['_FPDFPageObj_TransformClipPath'] = createExportWrapper('FPDFPageObj_TransformClipPath', 7);
var _FPDFPageObj_GetClipPath = Module['_FPDFPageObj_GetClipPath'] = createExportWrapper('FPDFPageObj_GetClipPath', 1);
var _FPDFClipPath_CountPaths = Module['_FPDFClipPath_CountPaths'] = createExportWrapper('FPDFClipPath_CountPaths', 1);
var _FPDFClipPath_CountPathSegments = Module['_FPDFClipPath_CountPathSegments'] = createExportWrapper('FPDFClipPath_CountPathSegments', 2);
var _FPDFClipPath_GetPathSegment = Module['_FPDFClipPath_GetPathSegment'] = createExportWrapper('FPDFClipPath_GetPathSegment', 3);
var _FPDF_CreateClipPath = Module['_FPDF_CreateClipPath'] = createExportWrapper('FPDF_CreateClipPath', 4);
var _FPDF_DestroyClipPath = Module['_FPDF_DestroyClipPath'] = createExportWrapper('FPDF_DestroyClipPath', 1);
var _FPDFPage_InsertClipPath = Module['_FPDFPage_InsertClipPath'] = createExportWrapper('FPDFPage_InsertClipPath', 2);
var _FPDF_InitLibrary = Module['_FPDF_InitLibrary'] = createExportWrapper('FPDF_InitLibrary', 0);
var _FPDF_DestroyLibrary = Module['_FPDF_DestroyLibrary'] = createExportWrapper('FPDF_DestroyLibrary', 0);
var _FPDF_SetSandBoxPolicy = Module['_FPDF_SetSandBoxPolicy'] = createExportWrapper('FPDF_SetSandBoxPolicy', 2);
var _FPDF_LoadDocument = Module['_FPDF_LoadDocument'] = createExportWrapper('FPDF_LoadDocument', 2);
var _FPDF_GetFormType = Module['_FPDF_GetFormType'] = createExportWrapper('FPDF_GetFormType', 1);
var _FPDF_LoadXFA = Module['_FPDF_LoadXFA'] = createExportWrapper('FPDF_LoadXFA', 1);
var _FPDF_LoadMemDocument = Module['_FPDF_LoadMemDocument'] = createExportWrapper('FPDF_LoadMemDocument', 3);
var _FPDF_LoadMemDocument64 = Module['_FPDF_LoadMemDocument64'] = createExportWrapper('FPDF_LoadMemDocument64', 3);
var _FPDF_LoadCustomDocument = Module['_FPDF_LoadCustomDocument'] = createExportWrapper('FPDF_LoadCustomDocument', 2);
var _FPDF_GetFileVersion = Module['_FPDF_GetFileVersion'] = createExportWrapper('FPDF_GetFileVersion', 2);
var _FPDF_DocumentHasValidCrossReferenceTable = Module['_FPDF_DocumentHasValidCrossReferenceTable'] = createExportWrapper('FPDF_DocumentHasValidCrossReferenceTable', 1);
var _FPDF_GetDocPermissions = Module['_FPDF_GetDocPermissions'] = createExportWrapper('FPDF_GetDocPermissions', 1);
var _FPDF_GetDocUserPermissions = Module['_FPDF_GetDocUserPermissions'] = createExportWrapper('FPDF_GetDocUserPermissions', 1);
var _FPDF_GetSecurityHandlerRevision = Module['_FPDF_GetSecurityHandlerRevision'] = createExportWrapper('FPDF_GetSecurityHandlerRevision', 1);
var _EPDF_SetEncryption = Module['_EPDF_SetEncryption'] = createExportWrapper('EPDF_SetEncryption', 4);
var _EPDF_RemoveEncryption = Module['_EPDF_RemoveEncryption'] = createExportWrapper('EPDF_RemoveEncryption', 1);
var _EPDF_UnlockOwnerPermissions = Module['_EPDF_UnlockOwnerPermissions'] = createExportWrapper('EPDF_UnlockOwnerPermissions', 2);
var _EPDF_IsEncrypted = Module['_EPDF_IsEncrypted'] = createExportWrapper('EPDF_IsEncrypted', 1);
var _EPDF_IsOwnerUnlocked = Module['_EPDF_IsOwnerUnlocked'] = createExportWrapper('EPDF_IsOwnerUnlocked', 1);
var _FPDF_GetPageCount = Module['_FPDF_GetPageCount'] = createExportWrapper('FPDF_GetPageCount', 1);
var _FPDF_LoadPage = Module['_FPDF_LoadPage'] = createExportWrapper('FPDF_LoadPage', 2);
var _FPDF_GetPageWidthF = Module['_FPDF_GetPageWidthF'] = createExportWrapper('FPDF_GetPageWidthF', 1);
var _FPDF_GetPageWidth = Module['_FPDF_GetPageWidth'] = createExportWrapper('FPDF_GetPageWidth', 1);
var _FPDF_GetPageHeightF = Module['_FPDF_GetPageHeightF'] = createExportWrapper('FPDF_GetPageHeightF', 1);
var _FPDF_GetPageHeight = Module['_FPDF_GetPageHeight'] = createExportWrapper('FPDF_GetPageHeight', 1);
var _FPDF_GetPageBoundingBox = Module['_FPDF_GetPageBoundingBox'] = createExportWrapper('FPDF_GetPageBoundingBox', 2);
var _FPDF_RenderPageBitmap = Module['_FPDF_RenderPageBitmap'] = createExportWrapper('FPDF_RenderPageBitmap', 8);
var _FPDF_RenderPageBitmapWithMatrix = Module['_FPDF_RenderPageBitmapWithMatrix'] = createExportWrapper('FPDF_RenderPageBitmapWithMatrix', 5);
var _EPDF_RenderAnnotBitmap = Module['_EPDF_RenderAnnotBitmap'] = createExportWrapper('EPDF_RenderAnnotBitmap', 6);
var _EPDF_RenderAnnotBitmapUnrotated = Module['_EPDF_RenderAnnotBitmapUnrotated'] = createExportWrapper('EPDF_RenderAnnotBitmapUnrotated', 6);
var _FPDF_ClosePage = Module['_FPDF_ClosePage'] = createExportWrapper('FPDF_ClosePage', 1);
var _FPDF_CloseDocument = Module['_FPDF_CloseDocument'] = createExportWrapper('FPDF_CloseDocument', 1);
var _FPDF_GetLastError = Module['_FPDF_GetLastError'] = createExportWrapper('FPDF_GetLastError', 0);
var _FPDF_DeviceToPage = Module['_FPDF_DeviceToPage'] = createExportWrapper('FPDF_DeviceToPage', 10);
var _FPDF_PageToDevice = Module['_FPDF_PageToDevice'] = createExportWrapper('FPDF_PageToDevice', 10);
var _FPDFBitmap_Create = Module['_FPDFBitmap_Create'] = createExportWrapper('FPDFBitmap_Create', 3);
var _FPDFBitmap_CreateEx = Module['_FPDFBitmap_CreateEx'] = createExportWrapper('FPDFBitmap_CreateEx', 5);
var _FPDFBitmap_GetFormat = Module['_FPDFBitmap_GetFormat'] = createExportWrapper('FPDFBitmap_GetFormat', 1);
var _FPDFBitmap_FillRect = Module['_FPDFBitmap_FillRect'] = createExportWrapper('FPDFBitmap_FillRect', 6);
var _FPDFBitmap_GetBuffer = Module['_FPDFBitmap_GetBuffer'] = createExportWrapper('FPDFBitmap_GetBuffer', 1);
var _FPDFBitmap_GetWidth = Module['_FPDFBitmap_GetWidth'] = createExportWrapper('FPDFBitmap_GetWidth', 1);
var _FPDFBitmap_GetHeight = Module['_FPDFBitmap_GetHeight'] = createExportWrapper('FPDFBitmap_GetHeight', 1);
var _FPDFBitmap_GetStride = Module['_FPDFBitmap_GetStride'] = createExportWrapper('FPDFBitmap_GetStride', 1);
var _FPDFBitmap_Destroy = Module['_FPDFBitmap_Destroy'] = createExportWrapper('FPDFBitmap_Destroy', 1);
var _FPDF_GetPageSizeByIndexF = Module['_FPDF_GetPageSizeByIndexF'] = createExportWrapper('FPDF_GetPageSizeByIndexF', 3);
var _EPDF_GetPageRotationByIndex = Module['_EPDF_GetPageRotationByIndex'] = createExportWrapper('EPDF_GetPageRotationByIndex', 2);
var _EPDF_GetPageSizeByIndexNormalized = Module['_EPDF_GetPageSizeByIndexNormalized'] = createExportWrapper('EPDF_GetPageSizeByIndexNormalized', 3);
var _EPDF_LoadPageNormalized = Module['_EPDF_LoadPageNormalized'] = createExportWrapper('EPDF_LoadPageNormalized', 3);
var _FPDF_GetPageSizeByIndex = Module['_FPDF_GetPageSizeByIndex'] = createExportWrapper('FPDF_GetPageSizeByIndex', 4);
var _FPDF_VIEWERREF_GetPrintScaling = Module['_FPDF_VIEWERREF_GetPrintScaling'] = createExportWrapper('FPDF_VIEWERREF_GetPrintScaling', 1);
var _FPDF_VIEWERREF_GetNumCopies = Module['_FPDF_VIEWERREF_GetNumCopies'] = createExportWrapper('FPDF_VIEWERREF_GetNumCopies', 1);
var _FPDF_VIEWERREF_GetPrintPageRange = Module['_FPDF_VIEWERREF_GetPrintPageRange'] = createExportWrapper('FPDF_VIEWERREF_GetPrintPageRange', 1);
var _FPDF_VIEWERREF_GetPrintPageRangeCount = Module['_FPDF_VIEWERREF_GetPrintPageRangeCount'] = createExportWrapper('FPDF_VIEWERREF_GetPrintPageRangeCount', 1);
var _FPDF_VIEWERREF_GetPrintPageRangeElement = Module['_FPDF_VIEWERREF_GetPrintPageRangeElement'] = createExportWrapper('FPDF_VIEWERREF_GetPrintPageRangeElement', 2);
var _FPDF_VIEWERREF_GetDuplex = Module['_FPDF_VIEWERREF_GetDuplex'] = createExportWrapper('FPDF_VIEWERREF_GetDuplex', 1);
var _FPDF_VIEWERREF_GetName = Module['_FPDF_VIEWERREF_GetName'] = createExportWrapper('FPDF_VIEWERREF_GetName', 4);
var _FPDF_CountNamedDests = Module['_FPDF_CountNamedDests'] = createExportWrapper('FPDF_CountNamedDests', 1);
var _FPDF_GetNamedDestByName = Module['_FPDF_GetNamedDestByName'] = createExportWrapper('FPDF_GetNamedDestByName', 2);
var _FPDF_GetNamedDest = Module['_FPDF_GetNamedDest'] = createExportWrapper('FPDF_GetNamedDest', 4);
var _FPDF_GetXFAPacketCount = Module['_FPDF_GetXFAPacketCount'] = createExportWrapper('FPDF_GetXFAPacketCount', 1);
var _FPDF_GetXFAPacketName = Module['_FPDF_GetXFAPacketName'] = createExportWrapper('FPDF_GetXFAPacketName', 4);
var _FPDF_GetXFAPacketContent = Module['_FPDF_GetXFAPacketContent'] = createExportWrapper('FPDF_GetXFAPacketContent', 5);
var _FPDF_GetTrailerEnds = Module['_FPDF_GetTrailerEnds'] = createExportWrapper('FPDF_GetTrailerEnds', 3);
var _fflush = createExportWrapper('fflush', 1);
var _emscripten_builtin_memalign = createExportWrapper('emscripten_builtin_memalign', 2);
var _strerror = createExportWrapper('strerror', 1);
var _setThrew = createExportWrapper('setThrew', 2);
var __emscripten_tempret_set = createExportWrapper('_emscripten_tempret_set', 1);
var _emscripten_stack_init = () => (_emscripten_stack_init = wasmExports['emscripten_stack_init'])();
var _emscripten_stack_get_free = () => (_emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'])();
var _emscripten_stack_get_base = () => (_emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'])();
var _emscripten_stack_get_end = () => (_emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'])();
var __emscripten_stack_restore = (a0) => (__emscripten_stack_restore = wasmExports['_emscripten_stack_restore'])(a0);
var __emscripten_stack_alloc = (a0) => (__emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'])(a0);
var _emscripten_stack_get_current = () => (_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'])();
var dynCall_ji = Module['dynCall_ji'] = createExportWrapper('dynCall_ji', 2);
var dynCall_jij = Module['dynCall_jij'] = createExportWrapper('dynCall_jij', 4);
var dynCall_iiij = Module['dynCall_iiij'] = createExportWrapper('dynCall_iiij', 5);
var dynCall_iij = Module['dynCall_iij'] = createExportWrapper('dynCall_iij', 4);
var dynCall_j = Module['dynCall_j'] = createExportWrapper('dynCall_j', 1);
var dynCall_jji = Module['dynCall_jji'] = createExportWrapper('dynCall_jji', 4);
var dynCall_iji = Module['dynCall_iji'] = createExportWrapper('dynCall_iji', 4);
var dynCall_viijii = Module['dynCall_viijii'] = createExportWrapper('dynCall_viijii', 7);
var dynCall_iiji = Module['dynCall_iiji'] = createExportWrapper('dynCall_iiji', 5);
var dynCall_jiji = Module['dynCall_jiji'] = createExportWrapper('dynCall_jiji', 5);
var dynCall_iiiiij = Module['dynCall_iiiiij'] = createExportWrapper('dynCall_iiiiij', 7);
var dynCall_iiiiijj = Module['dynCall_iiiiijj'] = createExportWrapper('dynCall_iiiiijj', 9);
var dynCall_iiiiiijj = Module['dynCall_iiiiiijj'] = createExportWrapper('dynCall_iiiiiijj', 10);
var dynCall_viji = Module['dynCall_viji'] = createExportWrapper('dynCall_viji', 5);

function invoke_viii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    return getWasmTableEntry(index)(a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_v(index) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)();
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9) {
  var sp = stackSave();
  try {
    getWasmTableEntry(index)(a1,a2,a3,a4,a5,a6,a7,a8,a9);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0) throw e;
    _setThrew(1, 0);
  }
}


// include: postamble.js
// === Auto-generated postamble setup entry stuff ===

Module['wasmExports'] = wasmExports;
Module['ccall'] = ccall;
Module['cwrap'] = cwrap;
Module['addFunction'] = addFunction;
Module['removeFunction'] = removeFunction;
Module['setValue'] = setValue;
Module['getValue'] = getValue;
Module['UTF8ToString'] = UTF8ToString;
Module['stringToUTF8'] = stringToUTF8;
Module['UTF16ToString'] = UTF16ToString;
Module['stringToUTF16'] = stringToUTF16;
var missingLibrarySymbols = [
  'writeI53ToI64',
  'writeI53ToI64Clamped',
  'writeI53ToI64Signaling',
  'writeI53ToU64Clamped',
  'writeI53ToU64Signaling',
  'readI53FromI64',
  'readI53FromU64',
  'convertI32PairToI53',
  'convertU32PairToI53',
  'getTempRet0',
  'setTempRet0',
  'exitJS',
  'inetPton4',
  'inetNtop4',
  'inetPton6',
  'inetNtop6',
  'readSockaddr',
  'writeSockaddr',
  'emscriptenLog',
  'readEmAsmArgs',
  'jstoi_q',
  'listenOnce',
  'autoResumeAudioContext',
  'dynCallLegacy',
  'getDynCaller',
  'dynCall',
  'handleException',
  'keepRuntimeAlive',
  'runtimeKeepalivePush',
  'runtimeKeepalivePop',
  'callUserCallback',
  'maybeExit',
  'asmjsMangle',
  'HandleAllocator',
  'getNativeTypeSize',
  'STACK_SIZE',
  'STACK_ALIGN',
  'POINTER_SIZE',
  'ASSERTIONS',
  'reallyNegative',
  'unSign',
  'strLen',
  'reSign',
  'formatString',
  'intArrayToString',
  'AsciiToString',
  'lengthBytesUTF16',
  'UTF32ToString',
  'stringToUTF32',
  'lengthBytesUTF32',
  'stringToNewUTF8',
  'registerKeyEventCallback',
  'maybeCStringToJsString',
  'findEventTarget',
  'getBoundingClientRect',
  'fillMouseEventData',
  'registerMouseEventCallback',
  'registerWheelEventCallback',
  'registerUiEventCallback',
  'registerFocusEventCallback',
  'fillDeviceOrientationEventData',
  'registerDeviceOrientationEventCallback',
  'fillDeviceMotionEventData',
  'registerDeviceMotionEventCallback',
  'screenOrientation',
  'fillOrientationChangeEventData',
  'registerOrientationChangeEventCallback',
  'fillFullscreenChangeEventData',
  'registerFullscreenChangeEventCallback',
  'JSEvents_requestFullscreen',
  'JSEvents_resizeCanvasForFullscreen',
  'registerRestoreOldStyle',
  'hideEverythingExceptGivenElement',
  'restoreHiddenElements',
  'setLetterbox',
  'softFullscreenResizeWebGLRenderTarget',
  'doRequestFullscreen',
  'fillPointerlockChangeEventData',
  'registerPointerlockChangeEventCallback',
  'registerPointerlockErrorEventCallback',
  'requestPointerLock',
  'fillVisibilityChangeEventData',
  'registerVisibilityChangeEventCallback',
  'registerTouchEventCallback',
  'fillGamepadEventData',
  'registerGamepadEventCallback',
  'registerBeforeUnloadEventCallback',
  'fillBatteryEventData',
  'battery',
  'registerBatteryEventCallback',
  'setCanvasElementSize',
  'getCanvasElementSize',
  'jsStackTrace',
  'getCallstack',
  'convertPCtoSourceLocation',
  'checkWasiClock',
  'wasiRightsToMuslOFlags',
  'wasiOFlagsToMuslOFlags',
  'createDyncallWrapper',
  'safeSetTimeout',
  'setImmediateWrapped',
  'clearImmediateWrapped',
  'polyfillSetImmediate',
  'registerPostMainLoop',
  'registerPreMainLoop',
  'getPromise',
  'makePromise',
  'idsToPromises',
  'makePromiseCallback',
  'ExceptionInfo',
  'findMatchingCatch',
  'Browser_asyncPrepareDataCounter',
  'safeRequestAnimationFrame',
  'arraySum',
  'addDays',
  'getSocketFromFD',
  'getSocketAddress',
  'FS_unlink',
  'FS_mkdirTree',
  '_setNetworkCallback',
  'heapObjectForWebGLType',
  'toTypedArrayIndex',
  'webgl_enable_ANGLE_instanced_arrays',
  'webgl_enable_OES_vertex_array_object',
  'webgl_enable_WEBGL_draw_buffers',
  'webgl_enable_WEBGL_multi_draw',
  'webgl_enable_EXT_polygon_offset_clamp',
  'webgl_enable_EXT_clip_control',
  'webgl_enable_WEBGL_polygon_mode',
  'emscriptenWebGLGet',
  'computeUnpackAlignedImageSize',
  'colorChannelsInGlTextureFormat',
  'emscriptenWebGLGetTexPixelData',
  'emscriptenWebGLGetUniform',
  'webglGetUniformLocation',
  'webglPrepareUniformLocationsBeforeFirstUse',
  'webglGetLeftBracePos',
  'emscriptenWebGLGetVertexAttrib',
  '__glGetActiveAttribOrUniform',
  'writeGLArray',
  'registerWebGlEventCallback',
  'runAndAbortIfError',
  'ALLOC_NORMAL',
  'ALLOC_STACK',
  'allocate',
  'writeStringToMemory',
  'writeAsciiToMemory',
  'setErrNo',
  'demangle',
  'stackTrace',
];
missingLibrarySymbols.forEach(missingLibrarySymbol)

var unexportedSymbols = [
  'run',
  'addOnPreRun',
  'addOnInit',
  'addOnPreMain',
  'addOnExit',
  'addOnPostRun',
  'addRunDependency',
  'removeRunDependency',
  'out',
  'err',
  'callMain',
  'abort',
  'wasmMemory',
  'writeStackCookie',
  'checkStackCookie',
  'convertI32PairToI53Checked',
  'stackSave',
  'stackRestore',
  'stackAlloc',
  'ptrToString',
  'zeroMemory',
  'getHeapMax',
  'growMemory',
  'ENV',
  'ERRNO_CODES',
  'strError',
  'DNS',
  'Protocols',
  'Sockets',
  'initRandomFill',
  'randomFill',
  'timers',
  'warnOnce',
  'readEmAsmArgsArray',
  'jstoi_s',
  'getExecutableName',
  'asyncLoad',
  'alignMemory',
  'mmapAlloc',
  'wasmTable',
  'noExitRuntime',
  'getCFunc',
  'uleb128Encode',
  'sigToWasmTypes',
  'generateFuncType',
  'convertJsFunctionToWasm',
  'freeTableIndexes',
  'functionsInTableMap',
  'getEmptyTableSlot',
  'updateTableMap',
  'getFunctionAddress',
  'PATH',
  'PATH_FS',
  'UTF8Decoder',
  'UTF8ArrayToString',
  'stringToUTF8Array',
  'lengthBytesUTF8',
  'intArrayFromString',
  'stringToAscii',
  'UTF16Decoder',
  'stringToUTF8OnStack',
  'writeArrayToMemory',
  'JSEvents',
  'specialHTMLTargets',
  'findCanvasEventTarget',
  'currentFullscreenStrategy',
  'restoreOldWindowedStyle',
  'UNWIND_CACHE',
  'ExitStatus',
  'getEnvStrings',
  'doReadv',
  'doWritev',
  'promiseMap',
  'uncaughtExceptionCount',
  'exceptionLast',
  'exceptionCaught',
  'Browser',
  'getPreloadedImageData__data',
  'wget',
  'MONTH_DAYS_REGULAR',
  'MONTH_DAYS_LEAP',
  'MONTH_DAYS_REGULAR_CUMULATIVE',
  'MONTH_DAYS_LEAP_CUMULATIVE',
  'isLeapYear',
  'ydayFromDate',
  'SYSCALLS',
  'preloadPlugins',
  'FS_createPreloadedFile',
  'FS_modeStringToFlags',
  'FS_getMode',
  'FS_stdin_getChar_buffer',
  'FS_stdin_getChar',
  'FS_createPath',
  'FS_createDevice',
  'FS_readFile',
  'FS',
  'FS_createDataFile',
  'FS_createLazyFile',
  'MEMFS',
  'TTY',
  'PIPEFS',
  'SOCKFS',
  'tempFixedLengthArray',
  'miniTempWebGLFloatBuffers',
  'miniTempWebGLIntBuffers',
  'GL',
  'AL',
  'GLUT',
  'EGL',
  'GLEW',
  'IDBStore',
  'SDL',
  'SDL_gfx',
  'allocateUTF8',
  'allocateUTF8OnStack',
  'print',
  'printErr',
];
unexportedSymbols.forEach(unexportedRuntimeSymbol);



var calledRun;
var calledPrerun;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!calledRun) run();
  if (!calledRun) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
};

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run() {

  if (runDependencies > 0) {
    return;
  }

  stackCheckInit();

  if (!calledPrerun) {
    calledPrerun = 1;
    preRun();

    // a preRun added a dependency, run will be called later
    if (runDependencies > 0) {
      return;
    }
  }

  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    if (calledRun) return;
    calledRun = 1;
    Module['calledRun'] = 1;

    if (ABORT) return;

    initRuntime();

    readyPromiseResolve(Module);
    Module['onRuntimeInitialized']?.();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(() => {
      setTimeout(() => Module['setStatus'](''), 1);
      doRun();
    }, 1);
  } else
  {
    doRun();
  }
  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  }
  try { // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    ['stdout', 'stderr'].forEach((name) => {
      var info = FS.analyzePath('/dev/' + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    });
  } catch(e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.');
  }
}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

run();

// end include: postamble.js

// include: postamble_modularize.js
// In MODULARIZE mode we wrap the generated code in a factory function
// and return either the Module itself, or a promise of the module.
//
// We assign to the `moduleRtn` global here and configure closure to see
// this as and extern so it won't get minified.

moduleRtn = readyPromise;

// Assertion for attempting to access module properties on the incoming
// moduleArg.  In the past we used this object as the prototype of the module
// and assigned properties to it, but now we return a distinct object.  This
// keeps the instance private until it is ready (i.e the promise has been
// resolved).
for (const prop of Object.keys(Module)) {
  if (!(prop in moduleArg)) {
    Object.defineProperty(moduleArg, prop, {
      configurable: true,
      get() {
        abort(`Access to module property ('${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`)
      }
    });
  }
}
// end include: postamble_modularize.js



  return moduleRtn;
}
);
})();
if (typeof exports === 'object' && typeof module === 'object')
  module.exports = createPdfium;
else if (typeof define === 'function' && define['amd'])
  define([], () => createPdfium);
