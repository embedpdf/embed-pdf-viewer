package cloudpdf

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// Reads the fixtures the way the client reads an annotation list and a form response.
func TestTolerantReading(t *testing.T) {
	body, err := os.ReadFile(os.Getenv("CLOUDPDF_ANNOTATIONS_FIXTURE"))
	if err != nil {
		t.Fatal(err)
	}
	var list AnnotationList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	fmt.Printf("annotations: %d\n", len(list.Annotations))
	if len(list.Annotations) != 5 {
		t.Fatalf("read %d annotations, expected 5", len(list.Annotations))
	}

	body, err = os.ReadFile(os.Getenv("CLOUDPDF_FORM_FIXTURE"))
	if err != nil {
		t.Fatal(err)
	}
	var form DocFormsListResponse
	if err := json.Unmarshal(body, &form); err != nil {
		t.Fatal(err)
	}
	fmt.Printf("fields: %d\n", len(form.Fields))
	if len(form.Fields) != 2 {
		t.Fatalf("read %d fields, expected 2", len(form.Fields))
	}
}
