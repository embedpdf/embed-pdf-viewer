using CloudPDF.Core;
using NUnit.Framework;

namespace CloudPDF.Test;

/// <summary>Reads the fixtures the way the client reads an annotation list and a form response.</summary>
[TestFixture]
public class TolerantReadingTest
{
    [Test]
    public void ReadsResponsesFromANewerServer()
    {
        var annotations = File.ReadAllText(Environment.GetEnvironmentVariable("CLOUDPDF_ANNOTATIONS_FIXTURE")!);
        var list = JsonUtils.Deserialize<AnnotationList>(annotations)!;
        TestContext.Out.WriteLine($"annotations: {list.Annotations.Count()}");
        Assert.That(list.Annotations.Count(), Is.EqualTo(5));

        var form = File.ReadAllText(Environment.GetEnvironmentVariable("CLOUDPDF_FORM_FIXTURE")!);
        var fields = JsonUtils.Deserialize<DocFormsListResponse>(form)!;
        TestContext.Out.WriteLine($"fields: {fields.Fields.Count()}");
        Assert.That(fields.Fields.Count(), Is.EqualTo(2));
    }
}
