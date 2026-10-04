class Webicro < Formula
  desc "AI-Powered Flutter Release Orchestrator & Multi-Store Distribution CLI/GUI"
  homepage "https://github.com/webicro/distribution"
  url "https://registry.npmjs.org/@webicro/cli/-/@webicro/cli-1.0.0.tgz"
  sha256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" # placeholder for published tarball
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "Webicro", shell_output("#{bin}/webicro --help")
    assert_match "release", shell_output("#{bin}/release --help")
  end
end
