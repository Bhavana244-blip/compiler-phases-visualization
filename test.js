const { compileFull } = require('./compiler');
const code = `
#include <stdio.h>
int main() {
    int i, j, n = 5;
    for(i = 1; i <= n; i++) {
        for(j = 1; j <= n; j++) {
            if(i == 1 || i == n || j == 1 || j == n)
                printf("* ");
            else
                printf("  ");
        }
        printf("\\n");
    }
    return 0;
}`;
const result = compileFull(code);
console.log(JSON.stringify(result.errors, null, 2));
