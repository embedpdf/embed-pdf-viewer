package com.cloudpdf.api;

import com.cloudpdf.api.core.ObjectMappers;
import com.cloudpdf.api.types.AnnotationList;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/** Reads the fixture the way the client reads an annotation list response. */
public final class TolerantReadingTest {
    @Test
    public void readsAResponseFromANewerServer() throws Exception {
        String body = Files.readString(Path.of(System.getenv("CLOUDPDF_FIXTURE")));
        AnnotationList list = ObjectMappers.JSON_MAPPER.readValue(body, AnnotationList.class);
        System.out.println("annotations: " + list.getAnnotations().size());
        Assertions.assertEquals(3, list.getAnnotations().size());
    }
}
