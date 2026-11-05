package com.cloudpdf.api;

import com.cloudpdf.api.core.ObjectMappers;
import com.cloudpdf.api.types.AnnotationList;
import com.cloudpdf.api.types.DocFormsListResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/** Reads the fixtures the way the client reads an annotation list and a form response. */
public final class TolerantReadingTest {
    @Test
    public void readsResponsesFromANewerServer() throws Exception {
        String annotations = Files.readString(Path.of(System.getenv("CLOUDPDF_ANNOTATIONS_FIXTURE")));
        AnnotationList list = ObjectMappers.JSON_MAPPER.readValue(annotations, AnnotationList.class);
        System.out.println("annotations: " + list.getAnnotations().size());
        Assertions.assertEquals(5, list.getAnnotations().size());

        String form = Files.readString(Path.of(System.getenv("CLOUDPDF_FORM_FIXTURE")));
        DocFormsListResponse fields = ObjectMappers.JSON_MAPPER.readValue(form, DocFormsListResponse.class);
        System.out.println("fields: " + fields.getFields().size());
        Assertions.assertEquals(2, fields.getFields().size());
    }
}
