/*  C prototypes for the “PDFiumExt_*” helpers
    ———————————————————————————————————————————————
    Only needed so Clang can “see” the symbols when we
    dump the AST; the real implementations live in main.cpp
*/
#ifdef __cplusplus
extern "C" {
#endif

void        PDFiumExt_Init(void);

void*       PDFiumExt_OpenFileWriter(void);
void        PDFiumExt_CloseFileWriter(void* writer);
int         PDFiumExt_GetFileWriterSize(void* writer);
int         PDFiumExt_GetFileWriterData(void* writer, void* buffer, int size);

void*       PDFiumExt_OpenFormFillInfo(void);
void        PDFiumExt_CloseFormFillInfo(void* info);
void*       PDFiumExt_InitFormFillEnvironment(void* doc, void* info);
void        PDFiumExt_ExitFormFillEnvironment(void* formHandle);

int         PDFiumExt_SaveAsCopy(void* document, void* writer);

int         EPDF_GetPageObjNum(void* document, int page_index);

#ifdef __cplusplus
}
#endif
