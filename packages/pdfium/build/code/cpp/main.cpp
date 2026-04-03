#include "fpdfview.h"
#include "fpdf_formfill.h"
#include <emscripten.h>
#include "filewriter.h"
#include "string.h"
#include "fpdfsdk/cpdfsdk_helpers.h"
#include "core/fpdfapi/parser/cpdf_document.h"
#include "core/fpdfapi/parser/cpdf_dictionary.h"

#ifdef __cplusplus
extern "C"
{
#endif

    EMSCRIPTEN_KEEPALIVE void PDFiumExt_Init();

    EMSCRIPTEN_KEEPALIVE void *PDFiumExt_OpenFileWriter();
    EMSCRIPTEN_KEEPALIVE int PDFiumExt_GetFileWriterSize(void *writer);
    EMSCRIPTEN_KEEPALIVE int PDFiumExt_GetFileWriterData(void *writer, void *buffer, int size);
    EMSCRIPTEN_KEEPALIVE void PDFiumExt_CloseFileWriter(void *writer);

    EMSCRIPTEN_KEEPALIVE void *PDFiumExt_OpenFormFillInfo();
    EMSCRIPTEN_KEEPALIVE void PDFiumExt_CloseFormFillInfo(void *form_fill_info);
    EMSCRIPTEN_KEEPALIVE void *PDFiumExt_InitFormFillEnvironment(void *document, void *form_fill_info);
    EMSCRIPTEN_KEEPALIVE void PDFiumExt_ExitFormFillEnvironment(void *form_handle);

    EMSCRIPTEN_KEEPALIVE int PDFiumExt_SaveAsCopy(void *document, void *writer);

    EMSCRIPTEN_KEEPALIVE int EPDF_GetPageObjNum(FPDF_DOCUMENT document, int page_index);

#ifdef __cplusplus
}
#endif

void PDFiumExt_Init()
{
    FPDF_LIBRARY_CONFIG config;
    config.version = 3;
    config.m_pUserFontPaths = nullptr;
    config.m_pIsolate = nullptr;
    config.m_v8EmbedderSlot = 0;
    config.m_pPlatform = nullptr;

    FPDF_InitLibraryWithConfig(&config);
}

void *PDFiumExt_OpenFileWriter()
{
    return new PDFiumExtFileWriter();
}

int PDFiumExt_GetFileWriterSize(void *writer)
{
    return static_cast<PDFiumExtFileWriter *>(writer)->data.length();
}

int PDFiumExt_GetFileWriterData(void *writer, void *buffer, int size)
{
    memcpy(static_cast<char *>(buffer), static_cast<PDFiumExtFileWriter *>(writer)->data.c_str(), size);
    return size;
}

void PDFiumExt_CloseFileWriter(void *writer)
{
    delete static_cast<PDFiumExtFileWriter *>(writer);
}

int PDFiumExt_SaveAsCopy(void *document, void *writer)
{
    PDFiumExtFileWriter *fileWriter = static_cast<PDFiumExtFileWriter *>(writer);
    return FPDF_SaveAsCopy(static_cast<FPDF_DOCUMENT>(document), static_cast<FPDF_FILEWRITE *>(fileWriter), 0);
}

void *PDFiumExt_OpenFormFillInfo()
{
    FPDF_FORMFILLINFO *form_fill_info = new FPDF_FORMFILLINFO();
    memset(form_fill_info, 0, sizeof(FPDF_FORMFILLINFO));
    form_fill_info->version = 1;
    form_fill_info->Release = nullptr;
    form_fill_info->m_pJsPlatform = nullptr;

    return form_fill_info;
}

void PDFiumExt_CloseFormFillInfo(void *form_fill_info)
{
    delete static_cast<FPDF_FORMFILLINFO *>(form_fill_info);
}

void *PDFiumExt_InitFormFillEnvironment(void *document, void *form_fill_info)
{
    return FPDFDOC_InitFormFillEnvironment(static_cast<FPDF_DOCUMENT>(document), static_cast<FPDF_FORMFILLINFO *>(form_fill_info));
}

void PDFiumExt_ExitFormFillEnvironment(void *form_handle)
{
    FPDFDOC_ExitFormFillEnvironment(static_cast<FPDF_FORMHANDLE>(form_handle));
}

int EPDF_GetPageObjNum(FPDF_DOCUMENT document, int page_index)
{
    CPDF_Document *pDoc = CPDFDocumentFromFPDFDocument(document);
    if (!pDoc)
        return -1;
    RetainPtr<const CPDF_Dictionary> pDict = pDoc->GetPageDictionary(page_index);
    if (!pDict)
        return -1;
    return static_cast<int>(pDict->GetObjNum());
}
