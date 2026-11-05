package cloudpdf

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

// Reads the fixture the way the client reads an annotation list response.
func TestTolerantReading(t *testing.T) {
	body, err := os.ReadFile(os.Getenv("CLOUDPDF_FIXTURE"))
	if err != nil {
		t.Fatal(err)
	}
	var list AnnotationList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	fmt.Printf("annotations: %d\n", len(list.Annotations))
	if len(list.Annotations) != 3 {
		t.Fatalf("read %d annotations, expected 3", len(list.Annotations))
	}
}
