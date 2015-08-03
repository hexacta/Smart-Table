ng.module('smart-table')
  .directive('stSearchButton', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        element.bind('click', function (evt) {
          if(attr.type == 'button'){
            ctrl.pipe();
          }
        });
      }
    };
  }]);
