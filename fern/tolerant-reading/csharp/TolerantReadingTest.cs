using CloudPDF.Core;
using NUnit.Framework;

namespace CloudPDF.Test;

/// <summary>Reads the fixture the way the client reads an annotation list response.</summary>
[TestFixture]
public class TolerantReadingTest
{
    [Test]
    public void ReadsAResponseFromANewerServer()
    {
        var body = File.ReadAllText(Environment.GetEnvironmentVariable("CLOUDPDF_FIXTURE")!);
        var list = JsonUtils.Deserialize<AnnotationList>(body)!;
        TestContext.Out.WriteLine($"annotations: {list.Annotations.Count()}");
        Assert.That(list.Annotations.Count(), Is.EqualTo(3));
    }
}
